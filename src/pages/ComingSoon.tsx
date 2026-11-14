import { Empty } from '../components/Empty'
import type { IconName } from '../components/Icon'
import { Shell } from '../components/Shell'

export function ComingSoon({ title, icon, text }: { title: string; icon: IconName; text: string }) {
  return (
    <Shell title={title}>
      <Empty icon={icon} title="Coming soon">{text}</Empty>
    </Shell>
  )
}
