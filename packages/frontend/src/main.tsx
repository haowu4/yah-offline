import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import styles from './main.module.css'
import { SearchProvider } from './ctx/SearchCtx.tsx'
import { MailProvider } from './ctx/MailCtx.tsx'
import { AppRoutes } from './routes.tsx'
import { MailToastHost } from './components/MailToast.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className={styles.root}>
      <BrowserRouter>
        <SearchProvider>
          <MailProvider>
            <AppRoutes />
            <MailToastHost />
          </MailProvider>
        </SearchProvider>
      </BrowserRouter>
    </div>
  </StrictMode>,
)
