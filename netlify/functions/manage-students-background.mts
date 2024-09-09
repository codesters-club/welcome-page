import type { Context } from "@netlify/functions";
import { Client as NotionClient } from "@notionhq/client";
import { Client as DiscordClient, GatewayIntentBits } from "discord.js";

// get environment variables
const notionSecret = Netlify.env.get("NOTION_SECRET") ?? "";
const notionDatabaseId = Netlify.env.get("NOTION_DATABASE_ID") ?? "";
const discordBotToken = Netlify.env.get("DISCORD_BOT_TOKEN") ?? "";
const discordGuildId = Netlify.env.get("DISCORD_GUILD_ID") ?? "";

// Discord role for generation 24
const genRoleId = "1278698426493571083";
// Doscord role IDs per school
const roleIds = {
  "Kadrioru Saksa Gümnaasium": "1278698662498795562",
  "Tallinna Ühisgümnaasium": "1278698829755056200",
  "Tallinna Mustamäe Gümnaasium": "1278698885480452117",
  "Tallinna Tehnikagümnaasium": "1278698979537846302",
  "Lasnamäe Gümnaasium": "",
  "Narva Gümnaasium": "1278699039042310145",
  "Tartu Jaan Poska Gümnaasium": "1278699546158960683",
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
      filter: {
        property: "Discord ID",
        rich_text: {
          is_not_empty: true,
        },
      },
      sorts: [
        {
          property: "Created time",
          direction: "ascending",
        },
      ],
    });

    const users = await Promise.all(
      notionResponse.results.map(async (entry: { id: string }) => {
        // retrieve each entry as a page from Notion
        const page = await notion.pages.retrieve({ page_id: entry.id });
        const discordId =
          page.properties["Discord ID"]?.rich_text[0].text.content;

        const firstName =
          page.properties["Firstname"]?.rich_text[0].text.content;

        const lastName = page.properties["Lastname"]?.rich_text[0].text.content;

        const fullName = firstName.trim() + " " + lastName.trim();

        const school = page.properties["intro form school"].select.name;

        const approved = page.properties["intro form APPROVED"]?.checkbox;

        return { discordId, fullName, school, approved };
      })
    );

    const logs: string[] = [];

    const guild = await discordClient.guilds.fetch(discordGuildId);

    const newUsers = users.filter((user) => !user.approved);

    console.log(`Total users: ${users.length}`);
    console.log(`New users: ${newUsers.length}`);

    for (const { fullName, discordId, school } of newUsers) {
      try {
        const member = await guild.members.fetch(discordId);
        if (member) {
          // Rename the user
          await member.setNickname(fullName);
          logs.push(`Renamed ${fullName} (Discord ID: ${discordId})`);

          // Assign the role
          const genRole = await guild.roles.fetch(genRoleId);

          if (genRole) {
            await member.roles.add(genRole);
            logs.push(
              `Assigned generation role and renamed ${fullName} (Discord ID: ${discordId})`
            );
          } else {
            console.error(`Role not found`);
            logs.push(`Role not found`);
          }

          for (const [schoolName, roleId] of Object.entries(roleIds)) {
            const role = await guild.roles.fetch(roleId);
            if (role && school === schoolName) {
              await member.roles.add(role);
              logs.push(
                `Assigned ${schoolName} role and renamed ${fullName} (Discord ID: ${discordId})`
              );
            }
          }
        } else {
          console.error(`Member with Discord ID ${discordId} not found`);
          logs.push(`Member with Discord ID ${discordId} not found`);
        }
      } catch (error: unknown) {
        console.error(
          `Failed to process ${fullName} (Discord ID: ${discordId}): ${
            (error as Error).message
          }`
        );
        logs.push(
          `Failed to process ${fullName} (Discord ID: ${discordId}): ${
            (error as Error).message
          }`
        );
      }
    }

    return new Response(
      JSON.stringify({
        message: "Role assignment and renaming completed",
        logs: logs,
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
