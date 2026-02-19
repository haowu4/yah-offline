import assert from "node:assert/strict"
import Database from "better-sqlite3"
import { runMigrations } from "../src/db/setup.js"
import { MailDBClient } from "../src/db/clients/mail.js"

function setReplyCreatedAt(db: Database.Database, replyId: number, createdAt: string) {
  db.prepare("UPDATE mail_reply SET created_at = ? WHERE id = ?").run(createdAt, replyId)
}

function threadUids(rows: Array<{ threadUid: string }>): string[] {
  return rows.map((row) => row.threadUid)
}

function main() {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  runMigrations(db)

  const mail = new MailDBClient(db)
  const alice = mail.createContact({ name: "Alice" })
  const bob = mail.createContact({ name: "Bob" })

  const threadTitleMatch = mail.createThread({ title: "Quarterly Plan" })
  const threadReplyMatch = mail.createThread({ title: "Weekly Sync" })
  const threadAttachmentMatch = mail.createThread({ title: "Graphics" })

  const replyTitleThread = mail.createReply({
    threadId: threadTitleMatch.id,
    role: "user",
    contactId: alice.id,
    content: "hello there",
    unread: false,
  })
  setReplyCreatedAt(db, replyTitleThread.id, "2026-02-10 08:30:00")

  const replyContentThread = mail.createReply({
    threadId: threadReplyMatch.id,
    role: "assistant",
    contactId: bob.id,
    content: "The roadmap includes phoenix launch milestones.",
    unread: false,
  })
  setReplyCreatedAt(db, replyContentThread.id, "2026-02-15 12:00:00")

  const replyAttachmentThread = mail.createReply({
    threadId: threadAttachmentMatch.id,
    role: "assistant",
    contactId: bob.id,
    content: "See attachment",
    unread: false,
  })
  setReplyCreatedAt(db, replyAttachmentThread.id, "2026-02-20 09:00:00")

  mail.createAttachment({
    replyId: replyAttachmentThread.id,
    filename: "project-brief.txt",
    kind: "text",
    mimeType: "text/plain; charset=utf-8",
    textContent: "Capex and hiring plan attached",
  })

  mail.createAttachment({
    replyId: replyContentThread.id,
    filename: "diagram-overview.png",
    kind: "image",
    mimeType: "image/png",
    binaryContent: Buffer.from([1, 2, 3]),
  })

  const titleSearch = threadUids(mail.listThreads({ keyword: "Quarterly" }))
  assert(titleSearch.includes(threadTitleMatch.threadUid), "title keyword should match thread title")

  const replySearch = threadUids(mail.listThreads({ keyword: "phoenix" }))
  assert(replySearch.includes(threadReplyMatch.threadUid), "keyword should match reply content")

  const attachmentTextSearch = threadUids(mail.listThreads({ keyword: "Capex" }))
  assert(
    attachmentTextSearch.includes(threadAttachmentMatch.threadUid),
    "keyword should match attachment text_content"
  )

  const attachmentFilenameSearch = threadUids(mail.listThreads({ keyword: "diagram-overview" }))
  assert(
    attachmentFilenameSearch.includes(threadReplyMatch.threadUid),
    "keyword should match attachment filename"
  )

  const dateFiltered = threadUids(
    mail.listThreads({
      fromReplyAt: "2026-02-15 00:00:00",
      toReplyAtExclusive: "2026-02-16 00:00:00",
    })
  )
  assert.deepEqual(
    dateFiltered,
    [threadReplyMatch.threadUid],
    "reply timestamp date window should filter by reply created_at"
  )

  const contactFiltered = threadUids(
    mail.listThreads({
      contactSlug: alice.slug,
      keyword: "Quarterly",
    })
  )
  assert.deepEqual(contactFiltered, [threadTitleMatch.threadUid], "contact filter should combine with keyword")

  db.close()
  console.log("Mail search test passed.")
}

main()
