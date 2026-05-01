export async function onRequestPost(context) {
  const auth = context.request.headers.get("Authorization");
  const expectedToken = context.env.API_TOKEN || "test123";

  if (auth !== `Bearer ${expectedToken}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await context.request.json();

  if (!body.question) {
    return Response.json({ ok: false, error: "Missing question" }, { status: 400 });
  }

  const result = await context.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "Du svarer alltid på norsk. Returner kun gyldig JSON."
      },
      {
        role: "user",
        content: body.question
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          confidence: { type: "number" },
          notes: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["answer", "confidence", "notes"]
      }
    }
  });

  return Response.json({
    ok: true,
    result
  });
}