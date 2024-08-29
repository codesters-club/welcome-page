import type { Context } from "@netlify/functions";
import { Client as NotionClient } from "@notionhq/client";
import { Client as DiscordClient, GatewayIntentBits } from "discord.js";

// get environment variables
const notionSecret = Netlify.env.get("NOTION_SECRET") ?? "";
const notionDatabaseId = Netlify.env.get("NOTION_DATABASE_ID") ?? "";
const discordBotToken = Netlify.env.get("DISCORD_BOT_TOKEN") ?? "";
const discordGuildId = Netlify.env.get("DISCORD_GUILD_ID") ?? "";

// Discord role for generation 24
const genRoleId = "1275384492499927086";
// Doscord role IDs per school
const roleIds = {
  "Kadrioru Saksa Gümnaasium": "1277266078464086178",
  "Tallinna Ühisgümnaasium": "",
  "Tallinna Mustamäe Gümnaasium": "",
  "Tallinna Tehnikagümnaasium": "1275384613992267777",
  "Lasnamäe Gümnaasium": "",
  "Narva Gümnaasium": "1277266122575712337",
  "Tartu Jaan Poska Gümnaasium": "",
};

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
        const school = page.properties["School"].select.name;
        return { userName, discordId, fullName, school };
      })
    );

    const guild = await discordClient.guilds.fetch(discordGuildId);

    for (const { fullName, discordId, school } of users) {
      try {
        const member = await guild.members.fetch(discordId);
        if (member) {
          // Rename the user
          await member.setNickname(fullName);

          // Assign the role

          const genRole = await guild.roles.fetch(genRoleId);

          if (genRole) {
            await member.roles.add(genRole);
            console.log(
              `Assigned role and renamed ${fullName} (Discord ID: ${discordId})`
            );
          } else {
            console.error(`Role not found`);
          }

          for (const [schoolName, roleId] of Object.entries(roleIds)) {
            const role = await guild.roles.fetch(roleId);
            if (role && school === schoolName) {
              await member.roles.add(role);
              console.log(
                `Assigned ${schoolName} role and renamed ${fullName} (Discord ID: ${discordId})`
              );
            }
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
