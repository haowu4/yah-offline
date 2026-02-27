import { Routes, Route, Navigate } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { ArticlePage } from "./pages/ArticlePage";
import { SearchPage } from "./pages/SearchPage";
import { ConfigPage } from "./pages/ConfigPage";
import { LLMFailuresPage } from "./pages/LLMFailuresPage";
import { OrderLogsPage } from "./pages/OrderLogsPage";
import styles from "./routes.module.css";

export function AppRoutes() {
    return (
        <div className={styles.root}>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/search" replace />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route path="/orders" element={<OrderLogsPage />} />
                    <Route path="/llm/failures" element={<LLMFailuresPage />} />
                    <Route path="/content/:slug" element={<ArticlePage />} />
                    <Route path="*" element={<Navigate to="/search" replace />} />
                </Route>
            </Routes>
        </div>
    );
}
