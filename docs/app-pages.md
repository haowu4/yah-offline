
# @ootc/yah api

## Search APIs

```
POST /api/query?query=
``` 


```
subscribe to query stream (sse)
GET /api/query?query=
``` 

```
POST /api/intent
```

```
GET /api/intent
```

```
GET /api/intent
```



## Mail Client


```
// list threads
get /api/mail/thread
``` 

```
// subscribe to thread (receive all mails)
get /api/mail/thread/:thread_id/mail
``` 


```
// send a new message to a threas
post /api/mail/thread/:thread_id
``` 


```
// get a mail content
post /api/mail/thread/:thread_id/mail/:mail_id
``` 

```
// get file id
post /api/mail/thread/:thread_id/attachment/:file_id
``` 

