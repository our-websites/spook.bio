// login.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; // e.g. https://spook.bio/api/auth/callback
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

router.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect("/login");

    try {
        // Exchange code for access token
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

        // Get user info
        const userResponse = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        // Auto join user to Discord server
        const joinResponse = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
            method: "PUT",
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                access_token: tokenData.access_token,
            }),
        });

        if (![201, 204].includes(joinResponse.status)) {
            console.log("Failed to add to server:", await joinResponse.text());
            return res.redirect("/login");
        }

        // Here you can set cookie for logged in user, for example:
        res.cookie("Account", userData.email, { maxAge: 365 * 24 * 60 * 60 * 1000 });

        // Redirect to dashboard or wherever
        res.redirect("/dashboard");

    } catch (err) {
        console.error(err);
        res.redirect("/login");
    }
});

export default router;
