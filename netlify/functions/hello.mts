import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const test = Netlify.env.get("TEST") ?? "NONE";
  return new Response("Hello, world!" + test);
};
