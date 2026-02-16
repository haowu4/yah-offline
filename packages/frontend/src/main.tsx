import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import styles from './main.module.css'
import { SearchProvider } from './ctx/SearchCtx.tsx'
import { AppRoutes } from './routes.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className={styles.root}>
      <BrowserRouter>
        <SearchProvider>
          <AppRoutes />
        </SearchProvider>
      </BrowserRouter>
    </div>
  </StrictMode>,
)
