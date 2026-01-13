import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import OpenAI from "openai";
import {
  getOAuthRedirectUrl,
  exchangeCodeForSessionToken,
  authMiddleware,
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";
import { getCookie, setCookie } from "hono/cookie";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

// ============= Authentication Routes =============

app.get("/api/oauth/google/redirect_url", async (c) => {
  const redirectUrl = await getOAuthRedirectUrl("google", {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  const body = await c.req.json();

  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const sessionToken = await exchangeCodeForSessionToken(body.code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  return c.json({ success: true }, 200);
});

app.get("/api/users/me", authMiddleware, async (c) => {
  return c.json(c.get("user"));
});

app.get("/api/logout", async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken === "string") {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
  }

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});

// ============= Chat Routes =============

app.get("/api/conversations", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC"
  )
    .bind(user.id)
    .all();

  return c.json(results);
});

app.post(
  "/api/conversations",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const { title } = c.req.valid("json");

    const result = await c.env.DB.prepare(
      "INSERT INTO chat_conversations (user_id, title) VALUES (?, ?) RETURNING *"
    )
      .bind(user.id, title)
      .first();

    return c.json(result);
  }
);

app.get("/api/conversations/:id/messages", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const conversationId = c.req.param("id");

  // Verify conversation belongs to user
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?"
  )
    .bind(conversationId, user.id)
    .first();

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC"
  )
    .bind(conversationId)
    .all();

  return c.json(results);
});

app.post(
  "/api/conversations/:id/messages",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      content: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const conversationId = c.req.param("id");
    const { content } = c.req.valid("json");

    // Verify conversation belongs to user
    const conversation = await c.env.DB.prepare(
      "SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?"
    )
      .bind(conversationId, user.id)
      .first();

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    // Save user message
    await c.env.DB.prepare(
      "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)"
    )
      .bind(conversationId, "user", content)
      .run();

    // Get conversation history
    const { results: messages } = await c.env.DB.prepare(
      "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
      .bind(conversationId)
      .all();

    const client = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY,
    });

    // Stream response
    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are LUX ai, an intelligent academic assistant designed to help students excel in their studies. Your capabilities include:

1. Explaining academic concepts clearly and thoroughly across all subjects
2. Breaking down complex research topics into understandable components
3. Providing study strategies and learning techniques
4. Helping with homework and assignment guidance (without doing the work for them)
5. Offering insights on internship programs and career development
6. Creating structured, well-organized study notes

When helping students:
- Be encouraging and supportive
- Explain concepts step-by-step
- Use examples and analogies to clarify difficult topics
- Suggest additional resources when appropriate
- Help them develop critical thinking skills
- Maintain academic integrity by guiding rather than providing direct answers to assignments`,
        },
        ...(messages as { role: string; content: string }[]).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullResponse = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }

          // Save assistant response
          await c.env.DB.prepare(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)"
          )
            .bind(conversationId, "assistant", fullResponse)
            .run();

          // Update conversation timestamp
          await c.env.DB.prepare(
            "UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          )
            .bind(conversationId)
            .run();

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);

app.delete("/api/conversations/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const conversationId = c.req.param("id");

  // Verify conversation belongs to user
  const conversation = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?"
  )
    .bind(conversationId, user.id)
    .first();

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Delete messages first
  await c.env.DB.prepare("DELETE FROM chat_messages WHERE conversation_id = ?")
    .bind(conversationId)
    .run();

  // Delete conversation
  await c.env.DB.prepare("DELETE FROM chat_conversations WHERE id = ?")
    .bind(conversationId)
    .run();

  return c.json({ success: true });
});

// ============= Guest Chat Route =============

app.post(
  "/api/guest/chat",
  zValidator(
    "json",
    z.object({
      message: z.string().min(1),
    })
  ),
  async (c) => {
    const { message } = c.req.valid("json");

    const client = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY,
    });

    // Stream response without saving to database
    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are LUX ai, an intelligent academic assistant designed to help students excel in their studies. Your capabilities include:

1. Explaining academic concepts clearly and thoroughly across all subjects
2. Breaking down complex research topics into understandable components
3. Providing study strategies and learning techniques
4. Helping with homework and assignment guidance (without doing the work for them)
5. Offering insights on internship programs and career development
6. Creating structured, well-organized study notes

When helping students:
- Be encouraging and supportive
- Explain concepts step-by-step
- Use examples and analogies to clarify difficult topics
- Suggest additional resources when appropriate
- Help them develop critical thinking skills
- Maintain academic integrity by guiding rather than providing direct answers to assignments`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);

// ============= Notes Routes =============

app.get("/api/notes", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC"
  )
    .bind(user.id)
    .all();

  return c.json(results);
});

app.post(
  "/api/notes",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1),
      content: z.string(),
      subject: z.string().optional(),
      tags: z.string().optional(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const { title, content, subject, tags } = c.req.valid("json");

    const result = await c.env.DB.prepare(
      "INSERT INTO notes (user_id, title, content, subject, tags) VALUES (?, ?, ?, ?, ?) RETURNING *"
    )
      .bind(user.id, title, content, subject || null, tags || null)
      .first();

    return c.json(result);
  }
);

app.put(
  "/api/notes/:id",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).optional(),
      content: z.string().optional(),
      subject: z.string().optional(),
      tags: z.string().optional(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const noteId = c.req.param("id");
    const updates = c.req.valid("json");

    // Verify note belongs to user
    const note = await c.env.DB.prepare(
      "SELECT * FROM notes WHERE id = ? AND user_id = ?"
    )
      .bind(noteId, user.id)
      .first();

    if (!note) {
      return c.json({ error: "Note not found" }, 404);
    }

    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }
    if (updates.subject !== undefined) {
      fields.push("subject = ?");
      values.push(updates.subject || null);
    }
    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(updates.tags || null);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(noteId, user.id);

    const result = await c.env.DB.prepare(
      `UPDATE notes SET ${fields.join(", ")} WHERE id = ? AND user_id = ? RETURNING *`
    )
      .bind(...values)
      .first();

    return c.json(result);
  }
);

app.delete("/api/notes/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const noteId = c.req.param("id");

  // Verify note belongs to user
  const note = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE id = ? AND user_id = ?"
  )
    .bind(noteId, user.id)
    .first();

  if (!note) {
    return c.json({ error: "Note not found" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(noteId).run();

  return c.json({ success: true });
});

export default app;
