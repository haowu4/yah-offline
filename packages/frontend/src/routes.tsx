import { Routes, Route, Navigate } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { ArticlePage } from "./pages/ArticlePage";
import { MailPage } from "./pages/MailPage";
import { SearchPage } from "./pages/SearchPage";
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
                    <Route path="*" element={<Navigate to="/search" replace />} />
                </Route>
            </Routes>
        </div>
    );
}
