
## Mail features

The LLM based main feature works similarly as a chat app, but only difference is that the interface is more email like comparing to chat.

The chat should allow text and image input. the LLM can use the additional tool calls
```js
function createTextFile(filename: string, model_quality: 'low' | 'normal' | 'high', content: string)
function createImageFile(filename: string, model_quality: 'low' | 'normal' | 'high', prompt: string)
```

Those file will create attachment files associated with that image.

The biggest difference between chat and mail is that mail interface allow user to switch which persona he is talking to in the middle of a thread.

`model_quality` will be selected based on config stored in database (with a reasonable default value if the config value is missing from db).

### Concepts

- Contact: this is a way for group threads, but also provide addition personality/ontext for assistant. (description of contact is included in system message). Contact can have a icon, color, default model (both provided by user with some default).
- Thread: thread is similar to a mail thread, which is a collection of `reply`. A thread has a title, which user can modify. if usre decide to leave the title empty, the system will generate one after response.
- Reply: this is one chat message (from user or assistant), it can also includes several text files and image files. 
- Attachment: named text files and image files.
- Context: Each contact should have its own version of context of a thread.

### Context Management

We use a hybrid approach, system prompt + contact prompt + summary + sliding window.

system prompt by: `mail.context.system_prompt`
size of silding window by: `mail.context.max_messages` 
summary is triggered by config: `mail.context.summary_trigger_token_count`
default llm model is by: `mail.default_model`. (user can select one in the interface)

### Pages

There are following pages:
- Mail home page `/mail`, it lists threads, and allows filter thread based on 

#### Contact pages
- contact listing page `/mail/contact`
- new contact page `/mail/new-contact`
- contact page `/mail/contact/:slug`

#### Thread and Reply Pages
- thread page `/mail/thread/:threadId`, this page looks similar to viewing a email thread. user can click each mail to open it. but by default it just show a mail title. and user can post new message on this page. (also can provide which contact, and which model to use)
- attachment listing page `/mail/thread/:threadId/attachment`: we use this page to view all attachment files used in the given mail thread.
- mail reply page `/mail/thread/:threadId/reply/:replyId`: we use this page to view the indivudal reply (content and attachments).
- attachment viewing page `/mail/thread/:threadId/reply/:replyId/attachment/:attachmentSlug`: view the content of this attachment

