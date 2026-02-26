import { Routes, Route, Navigate } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { ArticlePage } from "./pages/ArticlePage";
import { MailPage } from "./pages/MailPage";
import { SearchPage } from "./pages/SearchPage";
import { MailThreadPage } from "./pages/MailThreadPage";
import { MailAttachmentListPage } from "./pages/MailAttachmentListPage";
import { MailReplyPage } from "./pages/MailReplyPage";
import { MailAttachmentViewPage } from "./pages/MailAttachmentViewPage";
import { ConfigPage } from "./pages/ConfigPage";
import { MailLayout } from "./layout/MailLayout";
import styles from "./routes.module.css";

export function AppRoutes() {
    return (
        <div className={styles.root}>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/search" replace />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route path="/content/:slug" element={<ArticlePage />} />
                    <Route path="/mail" element={<MailLayout />}>
                        <Route index element={<MailPage />} />
                        <Route path="thread/new" element={<MailThreadPage />} />
                        <Route path="thread/:threadId" element={<MailThreadPage />} />
                        <Route path="thread/:threadId/attachment" element={<MailAttachmentListPage />} />
                        <Route path="thread/:threadId/reply/:replyId" element={<MailReplyPage />} />
                        <Route
                            path="thread/:threadId/reply/:replyId/attachment/:attachmentSlug"
                            element={<MailAttachmentViewPage />}
                        />
                    </Route>
                    <Route path="*" element={<Navigate to="/search" replace />} />
                </Route>
            </Routes>
        </div>
    );
}
