import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

// Load environment variables
dotenv.config();

const app = express();
app.use(cookieParser());

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; // e.g. https://spook.bio/api/auth/callback
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !GUILD_ID || !BOT_TOKEN) {
  console.error("❌ One or more required environment variables are missing.");
  process.exit(1);
}

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect("/login");

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) return res.redirect("/login");

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Auto join server (optional)
    await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: tokenData.access_token,
      }),
    });

    // Set cookies for the session
    res.cookie("Account", userData.username, { maxAge: ONE_YEAR });
    res.cookie("DisplayName", userData.global_name || userData.username, { maxAge: ONE_YEAR });

    res.redirect("/create");
  } catch (err) {
    console.error("OAuth Error:", err);
    res.redirect("/login");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Auth server running on port ${PORT}`));
