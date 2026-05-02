function stripMarkdownCodeFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildInvalidLessonResponse(message, parsed, rawText) {
  const topLevelKeys = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : [];
  const lessonValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.lesson : undefined;
  const lessonType = Array.isArray(lessonValue)
    ? "array"
    : lessonValue === null
      ? "null"
      : typeof lessonValue;
  const lessonObject = lessonValue && typeof lessonValue === "object" && !Array.isArray(lessonValue)
    ? lessonValue
    : null;
  const lessonKeys = lessonObject ? Object.keys(lessonObject) : [];

  return Response.json(
    {
      ok: false,
      error: "INVALID_LESSON_JSON",
      message,
      debug: {
        lessonType,
        topLevelKeys,
        lessonKeys,
        rawTextPreview: typeof rawText === "string" ? rawText.slice(0, 500) : ""
      }
    },
    { status: 502 }
  );
}

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

  const aiResult = await context.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
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
    ]
  });

  console.log("AI response shape", {
    type: typeof aiResult,
    isArray: Array.isArray(aiResult),
    keys: aiResult && typeof aiResult === "object" && !Array.isArray(aiResult) ? Object.keys(aiResult) : []
  });

  let rawText = null;
  let parsed = null;

  if (typeof aiResult === "string") {
    rawText = stripMarkdownCodeFences(aiResult);
  } else if (aiResult && typeof aiResult === "object") {
    if (typeof aiResult.response === "string") {
      rawText = stripMarkdownCodeFences(aiResult.response);
    } else if (typeof aiResult.text === "string") {
      rawText = stripMarkdownCodeFences(aiResult.text);
    } else {
      parsed = aiResult;
    }
  }

  if (!parsed) {
    if (typeof rawText !== "string" || !rawText.trim()) {
      return buildInvalidLessonResponse("Could not find JSON text in AI response.", aiResult, rawText);
    }

    try {
      parsed = JSON.parse(rawText);
    } catch {
      return buildInvalidLessonResponse("Failed to parse AI response as JSON.", aiResult, rawText);
    }
  }

  let normalizedLesson = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.lesson && typeof parsed.lesson === "object" && !Array.isArray(parsed.lesson)) {
      normalizedLesson = parsed.lesson;
    } else if (Array.isArray(parsed.lessons)) {
      normalizedLesson = { lessons: parsed.lessons };
    }
  }

  const lessons = normalizedLesson?.lessons;

  if (!normalizedLesson || typeof normalizedLesson !== "object" || !Object.prototype.hasOwnProperty.call(normalizedLesson, "lessons")) {
    return buildInvalidLessonResponse("AI response did not contain lesson.lessons array", parsed, rawText);
  }

  if (!Array.isArray(lessons)) {
    return buildInvalidLessonResponse("AI response did not contain lesson.lessons array", parsed, rawText);
  }

  if (lessons.length === 0) {
    return buildInvalidLessonResponse("AI response did not contain lesson.lessons array", parsed, rawText);
  }

  console.log("Lesson payload shape", {
    topLevelKeys: Object.keys(parsed),
    lessonKeys: Object.keys(normalizedLesson),
    lessonsCount: lessons.length
  });

  return Response.json({
    ok: true,
    lesson: {
      lessons
    }
  });
}
