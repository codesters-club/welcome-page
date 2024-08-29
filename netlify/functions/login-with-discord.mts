import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Authorization code missing" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const clientId = Netlify.env.get("CLIENT_ID") ?? "";
    const clientSecret = Netlify.env.get("CLIENT_SECRET") ?? "";
    const redirectUri = Netlify.env.get("REDIRECT_URI") ?? "";
    const formUrl = Netlify.env.get("FORM_URL") ?? "";

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        scope: "identify",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Error fetching token:", errorText);
      return new Response(JSON.stringify({ error: "Failed to fetch token" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user information using the access token
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error("Error fetching user data:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user data" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userData = await userResponse.json();
    const { id, username } = userData;

    // Construct the external form URL with the user’s Discord ID and username
    const formUrlwithParams = `${formUrl}?name=${encodeURIComponent(
      username
    )}&id=${id}`;

    // Redirect the user to the form URL
    return new Response(null, {
      status: 302,
      headers: {
        Location: formUrlwithParams,
      },
    });
  } catch (error) {
    console.error("OAuth2 Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
