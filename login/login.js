require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(express.static("public"));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

app.get("/auth/discord", (req, res) => {
  const scope = "guilds email identify guilds.join";
  const authUrl = `https://discord.com/oauth2/authorize?client_id=1402955374117650463&response_type=code&redirect_uri=https%3A%2F%2Fspook.bio%2Fapi%2Fauth&scope=guilds+email+guilds.join+identify`;
  res.redirect(authUrl);
});

app.get("/oauth2", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      scope: "guilds email identify guilds.join"
    }), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get user info
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = userResponse.data;
    req.session.user = user;

    // Auto-join user to your Discord server
    await axios.put(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, {
      access_token: accessToken
    }, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("OAuth2 or guild join failed.");
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  res.send(`
    <h1>Welcome, ${user.username}#${user.discriminator}</h1>
    <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="128" height="128">
    <p>ID: ${user.id}</p>
    <p>Email: ${user.email || 'Not available'}</p>
    <a href="/logout">Logout</a>
  `);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
