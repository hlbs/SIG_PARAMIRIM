import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const Home = lazy(() => import('@/pages/Home'))
const Publications = lazy(() => import('@/pages/Publications'))
const About = lazy(() => import('@/pages/About'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const SigWeb = lazy(() => import('@/pages/SigWeb'))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sigweb" element={<SigWeb />} />
      <Route path="/trabalhos" element={<Publications />} />
      <Route path="/publications" element={<Navigate to="/trabalhos" replace />} />
      <Route path="/eventos" element={<Navigate to="/sigweb" replace />} />
      <Route path="/about" element={<About />} />
      <Route path="/help" element={<Navigate to="/sigweb" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
