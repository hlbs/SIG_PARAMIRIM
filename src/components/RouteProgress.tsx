import { useEffect, useState } from 'react'

type Props = { routeKey: string }

export default function RouteProgress({ routeKey }: Props) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(true)
    const timer = window.setTimeout(() => setActive(false), 460)
    return () => window.clearTimeout(timer)
  }, [routeKey])

  return (
    <div className={`route-progress${active ? ' active' : ''}`} aria-hidden="true">
      <span className="route-progress-bar" />
    </div>
  )
}
