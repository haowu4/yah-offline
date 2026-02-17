import { Routes, Route, Navigate } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { ArticlePage } from "./pages/ArticlePage";
import { MailPage } from "./pages/MailPage";
import { SearchPage } from "./pages/SearchPage";
import { MailContactListPage } from "./pages/MailContactListPage";
import { MailNewContactPage } from "./pages/MailNewContactPage";
import { MailContactDetailPage } from "./pages/MailContactDetailPage";
import { MailThreadPage } from "./pages/MailThreadPage";
import { MailAttachmentListPage } from "./pages/MailAttachmentListPage";
import { MailReplyPage } from "./pages/MailReplyPage";
import { MailAttachmentViewPage } from "./pages/MailAttachmentViewPage";
import styles from "./routes.module.css";

export function AppRoutes() {
    return (
        <div className={styles.root}>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/search" replace />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/content/:slug" element={<ArticlePage />} />
                    <Route path="/mail" element={<MailPage />} />
                    <Route path="/mail/contact" element={<MailContactListPage />} />
                    <Route path="/mail/new-contact" element={<MailNewContactPage />} />
                    <Route path="/mail/contact/:slug" element={<MailContactDetailPage />} />
                    <Route path="/mail/thread/new" element={<MailThreadPage />} />
                    <Route path="/mail/thread/:threadId" element={<MailThreadPage />} />
                    <Route path="/mail/thread/:threadId/attachment" element={<MailAttachmentListPage />} />
                    <Route path="/mail/thread/:threadId/reply/:replyId" element={<MailReplyPage />} />
                    <Route
                        path="/mail/thread/:threadId/reply/:replyId/attachment/:attachmentSlug"
                        element={<MailAttachmentViewPage />}
                    />
                    <Route path="*" element={<Navigate to="/search" replace />} />
                </Route>
            </Routes>
        </div>
    );
}
