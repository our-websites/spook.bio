export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const pathname = url.pathname

    if (pathname === "/create" && request.method === "POST") {
      const form = await request.formData()
      const username = form.get("username")?.toLowerCase()

      if (!username) {
        return new Response("Invalid username", { status: 400 })
      }

      // Store in KV
      await env.USERS.put(username, JSON.stringify({ name: username }))

      return Response.redirect(`https://spook.bio/${username}`, 302)
    }

    const username = pathname.slice(1).toLowerCase()
    const userData = await env.USERS.get(username)

    if (userData) {
      const user = JSON.parse(userData)

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${user.name}'s Profile - spook.bio</title>
          <meta property="og:title" content="${user.name}'s Profile" />
          <meta property="og:description" content="This is the profile page for ${user.name}" />
          <meta property="og:image" content="https://spook.bio/assets/${user.name}.png" />
        </head>
        <body style="background:black;color:white;">
          <h1>Hello, ${user.name}</h1>
          <p>This page was auto-generated!</p>
        </body>
        </html>
      `
      return new Response(html, { headers: { "content-type": "text/html" } })
    }

    return new Response("Not Found", { status: 404 })
  },
}
