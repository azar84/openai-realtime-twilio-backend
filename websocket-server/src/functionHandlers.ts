import { FunctionHandler } from "./types";

const N8N_TOOL_URL = "https://n8n.hiqsense.com/webhook-test/ad467e52-bf96-4d1a-993c-8750340853db";
 // e.g. https://n8n.yourhost.com/webhook/tools/lookup_customer
const N8N_SECRET   = process.env.N8N_SECRET as string;   // set this same secret in n8n to verify requests

const functions: FunctionHandler[] = [];

functions.push({
  schema: {
    name: "get_weather_from_coords",
    type: "function",
    description: "Get the current weather",
    parameters: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
        },
        longitude: {
          type: "number",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  handler: async (args: { latitude: number; longitude: number }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
    );
    const data = await response.json();
    const currentTemp = data.current?.temperature_2m;
    return JSON.stringify({ temp: currentTemp });
  },
});

/** 2) n8n-backed tool (example: lookup customer by phone) */
functions.push({
  schema: {
    name: "lookup_customer",
    type: "function",
    description: "Find a customer and recent info by phone number via n8n workflow.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "E.164 phone number" },
      },
      required: ["phone"],
    },
  },
  handler: async (args: { phone: string }) => {
    if (!N8N_TOOL_URL) throw new Error("N8N_TOOL_URL missing");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000); // 12s timeout

    try {
      const res = await fetch(N8N_TOOL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tool-Secret": N8N_SECRET ?? "",
        },
        body: JSON.stringify({ phone: args.phone }),
        signal: controller.signal,
      });

      const text = await res.text();
      // n8n "Respond to Webhook" should return JSON; normalize either way
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!res.ok) {
        return JSON.stringify({
          error: "n8n_tool_error",
          status: res.status,
          body: data,
        });
      }
      return JSON.stringify(data);
    } catch (err: any) {
      return JSON.stringify({ error: "n8n_tool_exception", message: String(err?.message ?? err) });
    } finally {
      clearTimeout(timer);
    }
  },
});

/** 3) n8n-backed Knowledge Base tool  */
functions.push({
  schema: {
    name: "knowldege_base",
    type: "function",
    description: "This tool is used to answer questions about the company, contact information, use it first before you say that you don't have in formation. , products, services, etc.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "search query to find information in the knowledge base" },
      },
      required: ["query"],
    },
  },
  handler: async (args: { query: string }) => {
    if (!N8N_TOOL_URL) throw new Error("N8N_TOOL_URL missing");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000); // 12s timeout

    try {
      const res = await fetch("https://n8n.hiqsense.com/webhook/868f0106-771a-48e1-8f89-387558424747", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tool-Secret": N8N_SECRET ?? "",
        },
        body: JSON.stringify({ query: args.query }),
        signal: controller.signal,
      });

      const text = await res.text();
      // n8n "Respond to Webhook" should return JSON; normalize either way
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!res.ok) {
        return JSON.stringify({
          error: "n8n_tool_error",
          status: res.status,
          body: data,
        });
      }
      return JSON.stringify(data);
    } catch (err: any) {
      return JSON.stringify({ error: "n8n_tool_exception", message: String(err?.message ?? err) });
    } finally {
      clearTimeout(timer);
    }
  },
});



export default functions;