import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import multer from "multer";
import { Octokit } from "@octokit/rest";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import './api/auth/login.js';

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public")); // serve static assets (optional)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "spookbio";
const REPO_NAME = "spookbio.github.io";
const TEMPLATE_PATH = path.join(process.cwd(), "templates", "profile", "index.html");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Show create page
app.get("/create", (req, res) => {
  const account = req.cookies.Account;
  if (account) {
    return res.send(`You already have a page: <a href="/u/${account}">View</a> | <a href="/edit">Edit</a>`);
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
    return res.send(`You already have a page: <a href="/u/${account}">View</a>`);
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

    res.cookie("Account", username, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.send(`Profile created! <a href="/u/${username}">View</a>`);
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
    .replace(/\$\{user.display\}/g, account) // keep display = account if not editable
    .replace(/\$\{user.description\}/g, description);

  const pagePath = `u/${account}/index.html`;

  try {
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

    res.send(`Profile updated! <a href="/u/${account}">View</a>`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
