
### App Config
```ts
type ConfigValue = {
    id: int
    key: string
    value: string
}
```

### Search Engine

```ts
type Query = {
    id: int
    value: string // unique
    createdAt: Dates
}

type QueryIntent = {
    id: int
    query_id: int
    intent: string
}

type Article = {
    id: int
    intent_id: int
    title: string
    content: string
    createdAt: Dates
}
```
#### Relationships

One Query  has many QueryIntent
One QueryIntent has many Article


### Email Service
```ts
type Contact = {
    id: int
    name: string
    instruction?: string
    createdAt: Dates
}

type MailThread = {
    id: int
    threadId: string
    title: string
    context: string
    createdAt: Dates
    updatedAt: Dates
}

type MailMessage = {
    id: int
    who: 'user' | 'assistant'
    contact_id?: int
    title: string
    content: string
    createdAt: Dates
}

type FileAttachment = {
    id: int
    mail_message_id: int
    fileName: string
    fileType: 'text' | 'image'
    content: binary
    createdAt: Dates
}
```







 


 