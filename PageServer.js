// PageServer.js
import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import multer from "multer";
import { Octokit } from "@octokit/rest";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch"

// import loginRouter from './api/auth/login.js';

// Login System

// Load environment variables
dotenv.config();

const app = express();
app.use(cookieParser());

const CLIENT_ID = "1402955374117650463";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = "api.spook.bio/callback"; // e.g. https://spook.bio/api/auth/callback
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !GUILD_ID || !BOT_TOKEN) {
  console.error("❌ One or more required environment variables are missing.");
//  process.exit(1);
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

// const PORT2 = process.env.PORT || 5000;
// app.listen(PORT2, () => console.log(`✅ Auth server running on port ${PORT2}`));


// end of Login System

dotenv.config();

const upload = multer({ dest: "uploads/" });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public")); // Serve static files like CSS, images, JS

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "spookbio";
const REPO_NAME = "spook.bio";
const TEMPLATE_PATH = path.join(process.cwd(), "templates", "profile", "index.html");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Mount the login router under /api/auth
// app.use("/api/auth", loginRouter); (NOT A FUNCTION OR MODULE.)

// Show create page
app.get("/create", (req, res) => {
  const account = req.cookies.Account;
  if (account) {
    return res.send(`You already have a page: <a href="https://spook.bio/u/${account}">View</a> | <a href="/edit">Edit</a>`);
  }

  res.send(`
    <form method="POST" action="/create" enctype="multipart/form-data">
        <input name="username" placeholder="Username" required><br/>
        <input name="display" placeholder="Display Name" required><br/>
        <input name="description" placeholder="Description" required><br/>
        <input type="file" name="pfp" accept="image/*" required><br/>
        <button>Create Page</button>
    </form>
  `);
});

// Create page
app.post("/create", upload.single("pfp"), async (req, res) => {
  const { username, display, description } = req.body;
  const account = req.cookies.Account;

  if (account) {
    return res.send(`You already have a page: <a href="https://spook.bio/u/${account}">View</a>`);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const html = template
    .replace(/\$\{user.name\}/g, username)
    .replace(/\$\{user.display\}/g, display)
    .replace(/\$\{user.description\}/g, description);

  const pagePath = `u/${username}/index.html`;
  const pfpPath = `u/${username}/pfp.jpg`;

  try {
    // Upload HTML file
    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: pagePath,
      message: `Create profile for ${username}`,
      content: Buffer.from(html).toString("base64"),
    });

    // Upload profile picture
    const pfpBuffer = fs.readFileSync(req.file.path);
    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: pfpPath,
      message: `Upload profile picture for ${username}`,
      content: pfpBuffer.toString("base64"),
    });

    fs.unlinkSync(req.file.path); // cleanup temp file

    res.cookie("Account", username, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, secure: true });
    res.send(`Profile created! <a href="https://spook.bio/u/${username}">View</a>`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Edit description
app.get("/edit", (req, res) => {
  const account = req.cookies.Account;
  if (!account) return res.send("You don’t have a profile yet.");

  res.send(`
    <form method="POST" action="/edit">
        <input name="description" placeholder="New description" required><br/>
        <button>Save Changes</button>
    </form>
  `);
});

app.post("/edit", async (req, res) => {
  const account = req.cookies.Account;
  if (!account) return res.send("No account found.");

  const { description } = req.body;

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const html = template
    .replace(/\$\{user.name\}/g, account)
    .replace(/\$\{user.display\}/g, account) // keep display same as account for now
    .replace(/\$\{user.description\}/g, description);

  const pagePath = `u/${account}/index.html`;

  try {
    // Get current file's SHA to update it
    const { data: fileData } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: pagePath,
    });

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: pagePath,
      message: `Update profile for ${account}`,
      content: Buffer.from(html).toString("base64"),
      sha: fileData.sha,
    });

    res.send(`Profile updated! <a href="https://spook.bio/u/${account}">View</a>`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Example dashboard route (adjust or replace as needed)
app.get("/dashboard", (req, res) => {
  const account = req.cookies.Account;
  if (!account) {
    return res.redirect("/login");
  }
  res.send(`Welcome to your dashboard, ${account}! <a href="/edit">Edit Profile</a>`);
});

// Login page route placeholder
app.get("/login", (req, res) => {
  // This should link to your Discord OAuth URL to start login flow
  const discordLoginUrl = `https://discord.com/oauth2/authorize?client_id=1402955374117650463&response_type=code&redirect_uri=https%3A%2F%2Fspook.bio%2Fapi%2Fauth&scope=guilds+email+guilds.join+identify`;
  res.send(`<a href="${discordLoginUrl}">Login with Discord</a>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
