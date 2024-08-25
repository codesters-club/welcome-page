import type { Context } from "@netlify/functions";
const { Client: NotionClient } = require("@notionhq/client");
const { Client: DiscordClient, GatewayIntentBits } = require("discord.js");

// get environment variables
const notionSecret = Netlify.env.get("NOTION_SECRET") ?? "";
const notionDatabaseId = Netlify.env.get("NOTION_DATABASE_ID") ?? "";
const discordBotToken = Netlify.env.get("DISCORD_BOT_TOKEN") ?? "";
const discordGuildId = Netlify.env.get("DISCORD_GUILD_ID") ?? "";

// Set up Notion client
const notion = new NotionClient({ auth: notionSecret });

// Set up Discord client
const discordClient = new DiscordClient({
  intents: [],
});

export default async (req: Request, context: Context) => {
  try {
    // Ensure Discord client is ready
    if (!discordClient.isReady()) {
      await discordClient.login(discordBotToken);
    }

    // Fetch users from Notion database
    const notionResponse = await notion.databases.query({
      database_id: notionDatabaseId,
    });

    const users = await Promise.all(
      notionResponse.results.map(async (entry: { id: string }) => {
        // retrieve each entry as a page from Notion
        const page = await notion.pages.retrieve({ page_id: entry.id });
        const userName =
          page.properties["Discord Name"].rich_text[0].text.content;
        const discordId =
          page.properties["Discord ID"].rich_text[0].text.content;
        const firstName =
          page.properties["First name"].rich_text[0].text.content;
        const lastName = page.properties["Last name"].rich_text[0].text.content;
        const fullName = firstName + " " + lastName;
        return { userName, discordId, fullName };
      })
    );

    const guild = await discordClient.guilds.fetch(discordGuildId);

    for (const { fullName, discordId } of users) {
      try {
        const member = await guild.members.fetch(discordId);
        if (member) {
          // Rename the user
          await member.setNickname(fullName);

          // Assign the role
          const role = await guild.roles.fetch("1275384492499927086");
          console.log(role);

          if (role) {
            await member.roles.add(role);
            console.log(
              `Assigned role and renamed ${fullName} (Discord ID: ${discordId})`
            );
          } else {
            console.error(`Role not found`);
          }
        } else {
          console.error(`Member with Discord ID ${discordId} not found`);
        }
      } catch (error: unknown) {
        console.error(
          `Failed to process ${fullName} (Discord ID: ${discordId}): ${
            (error as Error).message
          }`
        );
      }
    }

    return new Response(
      JSON.stringify({
        message: "Role assignment and renaming completed",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error running function:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
