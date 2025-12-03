import login from "fca-priyansh";
import fs from "fs";
import express from "express";

// 🔥 Group ID auto-fix (safe)
function fixGroupID(id) {
  if (!id) return id;
  if (!id.startsWith("gid_") && id.length === 15) {
    return "gid_" + id;
  }
  return id;
}

const OWNER_UIDS = ["61581843293653" , "100084355986406" ,"61566537423355" , "61569765920987"];
let rkbInterval = null;
let stopRequested = false;
const lockedGroupNames = {};
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;

const friendUIDs = fs.existsSync("Friend.txt") ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];

const targetUIDs = fs.existsSync("Target.txt") ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];

const messageQueues = {};
const queueRunning = {};

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

process.on("uncaughtException", (err) => console.error("❗ Uncaught Exception:", err.message));
process.on("unhandledRejection", (reason) => console.error("❗ Unhandled Rejection:", reason));

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("❌ Login failed:", err);
  api.setOptions({ listenEvents: true });
  console.log("✅ Bot logged in and running...");

  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
      const { threadID, senderID, body, messageID } = event;
      const fixedTID = fixGroupID(threadID);  // 🔥 ALWAYS FIX THREAD ID

      const enqueueMessage = (uid, threadID, messageID, api) => {
        if (!messageQueues[uid]) messageQueues[uid] = [];
        messageQueues[uid].push({ threadID, messageID });

        if (queueRunning[uid]) return;
        queueRunning[uid] = true;

        const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
        let index = 0;

        const processQueue = async () => {
          if (!messageQueues[uid].length) {
            queueRunning[uid] = false;
            return;
          }

          const msg = messageQueues[uid].shift();
          const randomLine = lines[Math.floor(Math.random() * lines.length)];

          api.sendMessage(randomLine, fixGroupID(msg.threadID), msg.messageID);  // FIX APPLIED
          setTimeout(processQueue, 20000);
        };

        processQueue();
      };

      if (fs.existsSync("np.txt") && (targetUIDs.includes(senderID) || senderID === targetUID)) {
        enqueueMessage(senderID, fixedTID, messageID, api);
      }

      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const currentName = event.logMessageData.name;
        const lockedName = lockedGroupNames[fixedTID];
        if (lockedName && currentName !== lockedName) {
          try {
            await api.setTitle(lockedName, fixedTID);
            api.sendMessage(`  "${lockedName}"`, fixedTID);
          } catch (e) {
            console.error("❌ Error reverting group name:", e.message);
          }
        }
        return;
      }

      if (!body) return;
      const lowerBody = body.toLowerCase();

      const badNames = ["ayush", "abhay", "aj", "abhi", "devika", "AYUSH", "Devu"];
      const triggers = ["rkb", "bhen", "maa", "Rndi", "chut", "randi", "madhrchodh", "mc", "bc", "didi", "ma"];

      if (
        badNames.some(n => lowerBody.includes(n)) &&
        triggers.some(w => lowerBody.includes(w)) &&
        !friendUIDs.includes(senderID)
      ) {
        return api.sendMessage(
          "teri ma 2 rs ki Rawndi hai tu msg mt kr sb chowdengee teri ma  ko byy🙂 ss Lekr story Lga by",
          fixedTID,
          messageID
        );
      }

      if (!OWNER_UIDS.includes(senderID)) return;

      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      if (cmd === "/allname") {
        try {
          const info = await api.getThreadInfo(fixedTID);
          const members = info.participantIDs;
          api.sendMessage(`🛠  ${members.length} ' nicknames...`, fixedTID);
          for (const uid of members) {
            try {
              await api.changeNickname(input, fixedTID, uid);
              console.log(`✅ Nickname changed for UID: ${uid}`);
              await new Promise(res => setTimeout(res, 1000));
            } catch (e) {
              console.log(`⚠️ Failed for ${uid}:`, e.message);
            }
          }
          api.sendMessage("ye gribh ka bcha to Rone Lga bkL", fixedTID);
        } catch (e) {
          console.error("❌ Error in /allname:", e);
          api.sendMessage("badh me kLpauga", fixedTID);
        }
      }

      else if (cmd === "/groupname") {
        try {
          await api.setTitle(input, fixedTID);
          api.sendMessage(`📝 Group name changed to: ${input}`, fixedTID);
        } catch {
          api.sendMessage(" klpoo🤣 rkb", fixedTID);
        }
      }

      else if (cmd === "/lockgroupname") {
        if (!input) return api.sendMessage("name de 🤣 gc ke Liye", fixedTID);
        try {
          await api.setTitle(input, fixedTID);
          lockedGroupNames[fixedTID] = input;
          api.sendMessage(`🔒 Group name  "${input}"`, fixedTID);
        } catch {
          api.sendMessage("❌ Locking failed.", fixedTID);
        }
      }

      else if (cmd === "/unlockgroupname") {
        delete lockedGroupNames[fixedTID];
        api.sendMessage("🔓 Group name unlocked.", fixedTID);
      }

      else if (cmd === "/uid") {
        api.sendMessage(`🆔 Group ID: ${fixedTID}`, fixedTID);
      }

      else if (cmd === "/exit") {
        try {
          await api.removeUserFromGroup(api.getCurrentUserID(), fixedTID);
        } catch {
          api.sendMessage("❌ Can't leave group.", fixedTID);
        }
      }

      else if (cmd === "/rkb") {
        if (!fs.existsSync("np.txt")) return api.sendMessage("konsa gaLi du rkb ko", fixedTID);
        const name = input.trim();
        const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
        stopRequested = false;

        if (rkbInterval) clearInterval(rkbInterval);
        let index = 0;

        rkbInterval = setInterval(() => {
          if (index >= lines.length || stopRequested) {
            clearInterval(rkbInterval);
            rkbInterval = null;
            return;
          }
          api.sendMessage(`${name} ${lines[index]}`, fixedTID);
          index++;
        }, 60000);

        api.sendMessage(`sex hogya bche 🤣rkb ${name}`, fixedTID);
      }

      else if (cmd === "/stop") {
        stopRequested = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          api.sendMessage("chud gaye bche🤣", fixedTID);
        } else {
          api.sendMessage("konsa gaLi du sale ko🤣 rkb tha", fixedTID);
        }
      }

      else if (cmd === "/photo") {
        api.sendMessage("📸 Send a photo or video within 1 minute...", fixedTID);

        const handleMedia = async (mediaEvent) => {
          if (
            mediaEvent.type === "message" &&
            mediaEvent.threadID === threadID &&
            mediaEvent.attachments &&
            mediaEvent.attachments.length > 0
          ) {
            lastMedia = {
              attachments: mediaEvent.attachments,
              threadID: fixedTID
            };

            api.sendMessage("✅ Photo/video received. Will resend every 30 seconds.", fixedTID);

            if (mediaLoopInterval) clearInterval(mediaLoopInterval);
            mediaLoopInterval = setInterval(() => {
              if (lastMedia) {
                api.sendMessage({ attachment: lastMedia.attachments }, fixedTID);
              }
            }, 30000);

            api.removeListener("message", handleMedia);
          }
        };

        api.on("message", handleMedia);
      }

      else if (cmd === "/stopphoto") {
        if (mediaLoopInterval) {
          clearInterval(mediaLoopInterval);
          mediaLoopInterval = null;
          lastMedia = null;
          api.sendMessage("chud gaye sb.", fixedTID);
        } else {
          api.sendMessage("🤣ro sale chnar", fixedTID);
        }
      }

      else if (cmd === "/forward") {
        try {
          const info = await api.getThreadInfo(fixedTID);
          const members = info.participantIDs;

          const msgInfo = event.messageReply;
          if (!msgInfo) return api.sendMessage("❌ Kisi message ko reply karo bhai", fixedTID);

          for (const uid of members) {
            if (uid !== api.getCurrentUserID()) {
              try {
                await api.sendMessage({
                  body: msgInfo.body || "",
                  attachment: msgInfo.attachments || []
                }, uid);
              } catch (e) {
                console.log(`⚠️ Can't send to ${uid}:`, e.message);
              }
              await new Promise(res => setTimeout(res, 2000));
            }
          }

          api.sendMessage("📨 Forwarding complete.", fixedTID);
        } catch (e) {
          console.error("❌ Error in /forward:", e.message);
          api.sendMessage("❌ Error bhai, check logs", fixedTID);
        }
      }

      else if (cmd === "/target") {
        if (!args[1]) return api.sendMessage("👤 UID de jisko target krna h", fixedTID);
        targetUID = args[1];
        api.sendMessage(`ye chudega bhen ka Lowda ${targetUID}`, fixedTID);
      }

      else if (cmd === "/cleartarget") {
        targetUID = null;
        api.sendMessage("ro kr kLp gya bkL🤣", fixedTID);
      }

      else if (cmd === "/help") {
        const helpText = `
📌 Available Commands:
/allname <name> – Change all nicknames
/groupname <name> – Change group name
/lockgroupname <name> – Lock group name
/unlockgroupname – Unlock group name
/uid – Show group ID
/exit – group se Left Le Luga
/rkb <name> – HETTER NAME DAL
/stop – Stop RKB command
/photo – Send photo/video after this; it will repeat every 30s
/stopphoto – Stop repeating photo/video
/forward – Reply kisi message pe kro, sabko forward ho jaega
/target <uid> – Kisi UID ko target kr, msg pe random gali dega
/cleartarget – Target hata dega
/sticker<seconds> – Sticker.txt se sticker spam (e.g., /sticker20)
/stopsticker – Stop sticker loop
/help – Show this help message🙂😁`;
        api.sendMessage(helpText.trim(), fixedTID);
      }

      else if (cmd.startsWith("/sticker")) {
        if (!fs.existsSync("Sticker.txt")) return api.sendMessage("❌ Sticker.txt not found", fixedTID);

        const delay = parseInt(cmd.replace("/sticker", ""));
        if (isNaN(delay) || delay < 5) return api.sendMessage("🕐 Bhai sahi time de (min 5 seconds)", fixedTID);

        const stickerIDs = fs.readFileSync("Sticker.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean);
        if (!stickerIDs.length) return api.sendMessage("⚠️ Sticker.txt khali hai bhai", fixedTID);

        if (stickerInterval) clearInterval(stickerInterval);
        let i = 0;
        stickerLoopActive = true;

        api.sendMessage(`📦 Sticker bhejna start: har ${delay} sec`, fixedTID);

        stickerInterval = setInterval(() => {
          if (!stickerLoopActive || i >= stickerIDs.length) {
            clearInterval(stickerInterval);
            stickerInterval = null;
            stickerLoopActive = false;
            return;
          }

          api.sendMessage({ sticker: stickerIDs[i] }, fixedTID);
          i++;
        }, delay * 1000);
      }

      else if (cmd === "/stopsticker") {
        if (stickerInterval) {
          clearInterval(stickerInterval);
          stickerInterval = null;
          stickerLoopActive = false;
          api.sendMessage("🛑 Sticker bhejna band", fixedTID);
        } else {
          api.sendMessage("😒 Bhai kuch bhej bhi rha tha kya?", fixedTID);
        }
      }

    } catch (e) {
      console.error("⚠️ Error in message handler:", e.message);
    }
  });
});
