import { Link } from 'react-router-dom'
import { useNotifications } from '../lib/useNotifications'
import { Icon } from './Icon'

/** Bell with an unread count, linking to Notifications. */
export function Bell() {
  const { unread } = useNotifications(30)
  return (
    <Link to="/notifications" className="icon-btn bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <Icon name="bell" />
      {unread > 0 && <span className="bell-n num" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  )
}
