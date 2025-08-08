import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // GitHub PAT
const REPO_OWNER = "spookbio";
const REPO_NAME = "website";
const TEMPLATE_PATH = path.join(process.cwd(), "templates", "profile", "index.html");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Serve static files for testing (optional)
app.use(express.static("public"));

// Show create page
app.get("/create", (req, res) => {
    const account = req.cookies.Account;
    if (account) {
        return res.send(`You already have a page: <a href="/u/${account}">View</a> | <a href="/edit">Edit</a>`);
    }
    res.send(`
        <form method="POST" action="/create">
            <input name="username" placeholder="Username" required>
            <input name="description" placeholder="Description" required>
            <button>Create Page</button>
        </form>
    `);
});

// Create page
app.post("/create", async (req, res) => {
    const { username, description } = req.body;
    const account = req.cookies.Account;

    if (account) {
        return res.send(`You already have a page: <a href="spook.bio/u/${account}">View</a>`);
    }

    const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
    const html = template
        .replace(/\$\{user.name\}/g, username)
        .replace(/\$\{user.description\}/g, description);

    const filePath = `u/${username}/index.html`;

    try {
        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: filePath,
            message: `Create profile for ${username}`,
            content: Buffer.from(html).toString("base64"),
        });

        res.cookie("Account", username, { maxAge: 365 * 24 * 60 * 60 * 1000 });
        res.send(`Profile created! <a href="https://spook.bio/u/${username}">View</a>`);
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

// Edit page
app.get("/edit", (req, res) => {
    const account = req.cookies.Account;
    if (!account) return res.send("You don’t have a profile yet.");

    res.send(`
        <form method="POST" action="/edit">
            <input name="description" placeholder="New description" required>
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
        .replace(/\$\{user.description\}/g, description);

    const filePath = `u/${account}/index.html`;

    try {
        // Get SHA of existing file (required to update)
        const { data: fileData } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: filePath,
        });

        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: filePath,
            message: `Update profile for ${account}`,
            content: Buffer.from(html).toString("base64"),
            sha: fileData.sha,
        });

        res.send(`Profile updated! <a href="https://spook.bio/u/${account}">View</a>`);
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
