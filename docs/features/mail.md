
## Main features

The LLM based main feature works similarly as a chat app, but only difference is that the interface is more email like comparing to chat.


### Pages

There are 3 pages:
- Mail home page `/mail`, it lists threads, and allows filter
- contact listing page `/mail/contact`
- new contact page `/mail/new-contact`
- contact page `/mail/contact/:slug`
- thread page `/mail/thread/:threadId`, this page looks similar to viewing a email thread. user can click each mail to open it. but by default it just show a mail title.
- context viewing page `/mail/thread/:threadId/context`
- attachment listing page `/mail/thread/:threadId/attachments`

