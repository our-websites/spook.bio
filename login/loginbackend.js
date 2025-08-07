require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(session({
  secret: "TotallyASecretLOL",
  resave: false,
  saveUninitialized: true
}));

app.use(express.static("public"));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.get("/auth/discord", (req, res) => {
  const scope = "identify email";
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(discordAuthUrl);
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      scope: "identify email"
    }), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    req.session.user = userResponse.data;
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err.response?.data || err);
    res.send("OAuth2 failed.");
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

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
    res.redirect("/login.html");
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
