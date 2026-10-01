import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { courses } from "@/data/platform";
import {
  getCurrentAuthUser,
  onAuthStateChanged,
  type AuthUser,
} from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { createWavRecorder, type WavRecorder } from "@/lib/audio-recording";

type DoubtTicket = {
  id: number;
  courseId: string;
  courseTitle: string;
  title: string;
  body: string;
  status: "pending" | "answered";
  reply: string | null;
  instructorName: string | null;
  askedAt: string;
  responseDueAt: string;
  repliedAt: string | null;
  isOverdue: boolean;
  attachments: DoubtAttachment[];
  learner: {
    candidateNumber: string;
    name: string;
    email: string;
  };
};

type DoubtAttachment = {
  id: number;
  kind: "image" | "audio";
  fileName: string;
  contentType: string;
  url: string | null;
};

type ReplyAttachment = {
  file: File;
  kind: "image" | "audio";
};

export const Route = createFileRoute("/doubts")({
  head: () => ({
    meta: [
      { title: "Doubt clearing — HTS" },
      {
        name: "description",
        content: "Raise course doubts and receive instructor replies within 24 hours.",
      },
    ],
  }),
  component: Doubts,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AttachmentList({
  attachments,
  canRemove = false,
  onRemove,
  removingId,
}: {
  attachments: DoubtAttachment[];
  canRemove?: boolean;
  onRemove?: (attachmentId: number) => Promise<void>;
  removingId?: number | null;
}) {
  const [failedAttachmentIds, setFailedAttachmentIds] = useState<Set<number>>(() => new Set());

  if (!attachments.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fog">Attachments</div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="border border-ink/20 bg-paper p-2">
            {attachment.url && attachment.kind === "image" && !failedAttachmentIds.has(attachment.id) ? (
              <img
                src={attachment.url}
                alt={attachment.fileName}
                draggable={false}
                onContextMenu={(event) => event.preventDefault()}
                onError={() =>
                  setFailedAttachmentIds((previous) => new Set(previous).add(attachment.id))
                }
                className="max-h-52 max-w-full select-none object-contain"
              />
            ) : attachment.url && attachment.kind === "audio" && !failedAttachmentIds.has(attachment.id) ? (
              <audio
                controls
                preload="metadata"
                src={attachment.url}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(event) => event.preventDefault()}
                onError={() =>
                  setFailedAttachmentIds((previous) => new Set(previous).add(attachment.id))
                }
              />
            ) : (
              <div className="px-2 py-3 font-mono text-[10px] uppercase tracking-wider text-clay">
                Attachment unavailable
              </div>
            )}
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] text-fog">{attachment.fileName}</div>
              {canRemove && onRemove && (
                <button
                  type="button"
                  disabled={removingId === attachment.id}
                  onClick={() => void onRemove(attachment.id)}
                  className="font-mono text-[10px] uppercase text-clay disabled:opacity-40"
                >
                  {removingId === attachment.id ? "Removing..." : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftAttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: ReplyAttachment;
  onRemove: () => void;
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(attachment.file), [attachment.file]);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <div className="flex items-center gap-2 border border-ink/20 bg-paper p-2">
      {attachment.kind === "audio" ? (
        <audio
          controls
          preload="metadata"
          src={previewUrl}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
        />
      ) : (
        <img
          src={previewUrl}
          alt={attachment.file.name}
          className="size-12 object-cover"
          draggable={false}
        />
      )}
      <span className="font-mono text-[10px] text-fog">{attachment.file.name}</span>
      <button type="button" onClick={onRemove} className="font-mono text-[10px] uppercase text-clay">
        Remove
      </button>
    </div>
  );
}

function DoubtCard({
  ticket,
  instructor,
  onReply,
  onRemoveAttachment,
}: {
  ticket: DoubtTicket;
  instructor: boolean;
  onReply?: (ticketId: number, reply: string, attachments: ReplyAttachment[]) => Promise<void>;
  onRemoveAttachment?: (ticketId: number, attachmentId: number) => Promise<void>;
}) {
  const [reply, setReply] = useState(ticket.reply ?? "");
  const [editing, setEditing] = useState(ticket.status === "pending");
  const [composerOpen, setComposerOpen] = useState(ticket.status === "pending");
  const [attachments, setAttachments] = useState<ReplyAttachment[]>([]);
  const [replying, setReplying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const discardRecordingRef = useRef(false);

  const stopRecording = (discard: boolean) => {
    discardRecordingRef.current = discard;
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    void recorder.stop()
      .then((file) => {
        if (!discardRecordingRef.current) {
          setAttachments((previous) => [...previous, { file, kind: "audio" }]);
        }
      })
      .catch((error: unknown) => {
        if (!discardRecordingRef.current) {
          setRecordingError(error instanceof Error ? error.message : "Unable to capture audio.");
        }
      })
      .finally(() => {
        discardRecordingRef.current = false;
        setRecording(false);
        setRecordingPaused(false);
      });
  };

  useEffect(() => () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) void recorder.stop().catch(() => undefined);
  }, []);

  const cancelComposer = () => {
    if (recording) stopRecording(true);
    setReply(ticket.reply ?? "");
    setAttachments([]);
    setRecordingError(null);
    setRecordingPaused(false);
    setComposerOpen(false);
    setEditing(false);
  };

  const removeSavedAttachment = async (attachmentId: number) => {
    if (!onRemoveAttachment) return;
    setRemovingAttachmentId(attachmentId);
    try {
      await onRemoveAttachment(ticket.id, attachmentId);
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  return (
    <article className="border-2 border-ink bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black leading-tight">{ticket.title}</h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fog">
            {ticket.courseTitle || ticket.courseId} · Asked {formatDate(ticket.askedAt)}
          </p>
          {instructor && (
            <p className="mt-1 font-mono text-[10px] text-clay">
              {ticket.learner.name || "Learner"} · {ticket.learner.candidateNumber} · {ticket.learner.email}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 font-mono text-[9px] uppercase ${
            ticket.status === "answered"
              ? "bg-moss text-paper"
              : ticket.isOverdue
                ? "bg-clay text-paper"
                : "bg-sand text-ink/70"
          }`}
        >
          {ticket.status === "pending" && ticket.isOverdue ? "overdue" : ticket.status}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[13px]">{ticket.body}</p>

      {ticket.status === "pending" && (
        <p className="mt-3 font-mono text-[10px] text-fog">
          Response expected by {formatDate(ticket.responseDueAt)} · within 24 hours
        </p>
      )}

      {(ticket.reply || ticket.attachments.length > 0) && (
        <div className="mt-3 border-l-2 border-moss bg-sand/60 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-moss">
            {ticket.instructorName || "Instructor"} · Reply · {formatDate(ticket.repliedAt)}
          </div>
          {ticket.reply && <p className="mt-1 whitespace-pre-wrap text-[13px]">{ticket.reply}</p>}
          <AttachmentList
            attachments={ticket.attachments}
            canRemove={instructor && editing}
            onRemove={onRemoveAttachment ? removeSavedAttachment : undefined}
            removingId={removingAttachmentId}
          />
        </div>
      )}

      {instructor && onReply && !composerOpen && (
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setComposerOpen(true);
          }}
          className="mt-3 border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          {ticket.status === "answered" ? "Edit reply" : "Reply to doubt"}
        </button>
      )}

      {instructor && onReply && composerOpen && (
        <form
          className="mt-4 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!reply.trim() && !attachments.length && !ticket.attachments.length) return;
            setReplying(true);
            try {
              await onReply(ticket.id, reply.trim(), attachments);
              setAttachments([]);
              setComposerOpen(false);
              setRecordingPaused(false);
              setEditing(false);
            } finally {
              setReplying(false);
            }
          }}
        >
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            placeholder="Write the instructor reply..."
            className="w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                  .filter((file) => file.type.startsWith("image/"))
                  .map((file) => ({ file, kind: "image" as const }));
                setAttachments((previous) => [...previous, ...files]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              Add images
            </button>
            <button
              type="button"
              onClick={async () => {
                if (recording) {
                  stopRecording(false);
                  return;
                }
                let stream: MediaStream | null = null;
                try {
                  setRecordingError(null);
                  discardRecordingRef.current = false;
                  const microphoneStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                      channelCount: 1,
                      echoCancellation: false,
                      noiseSuppression: false,
                      autoGainControl: false,
                    },
                  });
                  stream = microphoneStream;
                  const recorder = await createWavRecorder(microphoneStream);
                  recorderRef.current = recorder;
                  setRecording(true);
                  // Keep the stream alive until the WAV recorder has finished
                  // flushing its final audio process callback.
                  const originalStop = recorder.stop;
                  recorder.stop = async () => {
                    try {
                      return await originalStop();
                    } finally {
                      microphoneStream.getTracks().forEach((track) => track.stop());
                    }
                  };
                } catch (error) {
                  stream?.getTracks().forEach((track) => track.stop());
                  setRecordingError(error instanceof Error ? error.message : "Microphone access was denied.");
                }
              }}
              className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${recording ? "border-clay text-clay" : "border-ink"}`}
            >
              {recording ? "End recording" : "Record voice"}
            </button>
            {recording && (
              <button
                type="button"
                onClick={() => {
                  if (!recorderRef.current) return;
                  if (recordingPaused) {
                    recorderRef.current.resume();
                    setRecordingPaused(false);
                  } else {
                    recorderRef.current.pause();
                    setRecordingPaused(true);
                  }
                }}
                className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em]"
              >
                {recordingPaused ? "Resume recording" : "Pause recording"}
              </button>
            )}
            {recording && (
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="border border-clay px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-clay"
              >
                Cancel recording
              </button>
            )}
            <button
              type="button"
              onClick={cancelComposer}
              disabled={replying}
              className="border border-ink/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-fog disabled:opacity-40"
            >
              Cancel reply
            </button>
            <button
              type="submit"
              disabled={replying || recording || (!reply.trim() && !attachments.length && !ticket.attachments.length)}
              className="bg-moss px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
            >
              {replying ? "Saving..." : ticket.status === "answered" ? "Save edit" : "Send reply"}
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-fog">New attachments:</div>
              {attachments.map((attachment, index) => (
                <DraftAttachmentPreview
                  key={`${attachment.file.name}-${index}`}
                  attachment={attachment}
                  onRemove={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                />
              ))}
            </div>
          )}
          {recordingError && <p className="text-xs text-clay">{recordingError}</p>}
        </form>
      )}
    </article>
  );
}

function Doubts() {
  const [user, setUser] = useState<AuthUser | null>(getCurrentAuthUser());
  const [tickets, setTickets] = useState<DoubtTicket[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged((nextUser) => {
    setUser(nextUser);
  }), []);

  const view: "student" | "instructor" = user?.isInstructor ? "instructor" : "student";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const path =
      view === "instructor"
        ? `/api/instructor/doubts/${courseFilter ? `?courseId=${encodeURIComponent(courseFilter)}` : ""}`
        : "/api/me/doubts/";

    void apiFetch(path)
      .then(async (response) => (await response.json()) as DoubtTicket[])
      .then((nextTickets) => {
        if (!cancelled) setTickets(nextTickets);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load doubts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseFilter, user, view]);

  const pending = useMemo(
    () => tickets.filter((ticket) => ticket.status === "pending").length,
    [tickets],
  );

  const submitDoubt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedCourse = courses.find((course) => course.id === courseId);
    if (!selectedCourse || !title.trim() || !body.trim()) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/me/doubts/", {
        method: "POST",
        body: JSON.stringify({
          courseId: selectedCourse.id,
          courseTitle: selectedCourse.title,
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const ticket = (await response.json()) as DoubtTicket;
      setTickets((previous) => [ticket, ...previous]);
      setTitle("");
      setBody("");
      setNotice("Your doubt was saved. An instructor will reply within 24 hours.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save doubt");
    } finally {
      setSaving(false);
    }
  };

  const replyToDoubt = async (ticketId: number, reply: string, files: ReplyAttachment[]) => {
    for (const attachment of files) {
      const uploadResponse = await apiFetch(`/api/instructor/doubts/${ticketId}/attachments/upload/`, {
        method: "POST",
        body: JSON.stringify({
          kind: attachment.kind,
          fileName: attachment.file.name,
          contentType: attachment.file.type,
        }),
      });
      const upload = (await uploadResponse.json()) as {
        key: string;
        uploadUrl: string;
        contentType: string;
      };
      const stored = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.contentType },
        body: attachment.file,
      });
      if (!stored.ok) throw new Error(`Unable to upload ${attachment.file.name}`);

      await apiFetch(`/api/instructor/doubts/${ticketId}/attachments/complete/`, {
        method: "POST",
        body: JSON.stringify({
          key: upload.key,
          kind: attachment.kind,
          fileName: attachment.file.name,
        }),
      });
    }

    const response = await apiFetch(`/api/instructor/doubts/${ticketId}/`, {
      method: "PATCH",
      body: JSON.stringify({ reply }),
    });
    const updated = (await response.json()) as DoubtTicket;
    setTickets((previous) => previous.map((ticket) => (ticket.id === ticketId ? updated : ticket)));
  };

  const removeAttachment = async (ticketId: number, attachmentId: number) => {
    await apiFetch(`/api/instructor/doubts/${ticketId}/attachments/${attachmentId}/`, {
      method: "DELETE",
    });
    setTickets((previous) => previous.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        attachments: ticket.attachments.filter((attachment) => attachment.id !== attachmentId),
      };
    }));
  };

  if (!user) return null;

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rule-label">{view === "instructor" ? "Instructor doubts" : "Doubt clearing"}</span>
        <span className="h-px flex-1 bg-ink/15" />
        <span className="font-mono text-[10px] text-clay">{pending} pending</span>
      </div>

      {error && <div className="mb-3 border-2 border-clay bg-sand p-3 text-sm text-clay">{error}</div>}
      {notice && <div className="mb-3 border-2 border-moss bg-sand p-3 text-sm text-moss">{notice}</div>}

      {view === "instructor" ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2 border-2 border-ink bg-sand p-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fog">Course</span>
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              className="border border-ink/25 bg-paper px-2 py-1.5 text-sm"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="border-2 border-ink bg-paper p-5 font-mono text-[11px]">Loading doubts...</p>
          ) : tickets.length === 0 ? (
            <p className="border-2 border-ink bg-paper p-5 text-sm">No doubts found for this course.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <DoubtCard
                  key={ticket.id}
                  ticket={ticket}
                  instructor
                  onReply={replyToDoubt}
                  onRemoveAttachment={removeAttachment}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-12 gap-3">
          <section className="col-span-12 space-y-3 lg:col-span-8">
            {loading ? (
              <p className="border-2 border-ink bg-paper p-5 font-mono text-[11px]">Loading your doubts...</p>
            ) : tickets.length === 0 ? (
              <p className="border-2 border-ink bg-paper p-5 text-sm">You have not raised any doubts yet.</p>
            ) : (
              tickets.map((ticket) => <DoubtCard key={ticket.id} ticket={ticket} instructor={false} />)
            )}
          </section>

          <aside className="col-span-12 lg:col-span-4">
            <div className="border-2 border-ink bg-paper p-4">
              <div className="rule-label mb-2">Raise a doubt</div>
              <form onSubmit={submitDoubt}>
                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                  className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm"
                >
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Your doubt in one line"
                  className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm"
                />
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  placeholder="Context — what you tried and where you got stuck"
                  className="mb-2 w-full border border-ink/25 bg-paper px-2 py-1.5 text-sm"
                />
                <button
                  disabled={saving || !title.trim() || !body.trim()}
                  className="w-full bg-clay px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
                >
                  {saving ? "Saving..." : "Send to instructor"}
                </button>
              </form>
              <p className="mt-2 font-mono text-[10px] text-fog">
                Your doubt is stored securely. An instructor response is expected within 24 hours.
              </p>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
