import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

export default function ChatModelsPage() { return <SiteFrame><ModelCatalog models={models.filter((model) => model.category === 'chat')} /></SiteFrame>; }
