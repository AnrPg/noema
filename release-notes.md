:robot: I have created a release *beep* *boop*
---


<details><summary>noema: 0.1.1</summary>

## [0.1.1](https://github.com/AnrPg/noema/compare/noema-v0.1.0...noema-v0.1.1) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* add interactive recovery screens for learner-facing errors ([3cf243e](https://github.com/AnrPg/noema/commit/3cf243ed26c5a3d5eaee862d654f4f3b7949bccf))
* add step progress counter to registration wizard ([4c33eda](https://github.com/AnrPg/noema/commit/4c33eda23168e18301a2d8680a62919b8fedd4af))
* add Traefik API gateway with unified routing and CORS ([f0ccbcb](https://github.com/AnrPg/noema/commit/f0ccbcb4a92083db609e65ff086e30abc809e0aa))
* add user detail page with navigation from users list ([9fafd42](https://github.com/AnrPg/noema/commit/9fafd42c1c7d8b032d3c46d19d8fb286d52d7ae4))
* **api-client:** add Content service module (cards, templates, media) ([63427d4](https://github.com/AnrPg/noema/commit/63427d4e10f9f49c2a60116c73ec68d888712468))
* **api-client:** add Content service types (cards, templates, media) ([5887660](https://github.com/AnrPg/noema/commit/5887660fbf392e2ebe8a8f310993397bf23fc1f2))
* **api-client:** add findRecentBatches, rollbackBatch, findCardsByBatchId to cardsApi ([5681a21](https://github.com/AnrPg/noema/commit/5681a216e28da52eec7ddead80781bc0ec848975))
* **api-client:** add HTTP client package for backend communication ([9a8ba38](https://github.com/AnrPg/noema/commit/9a8ba38e54da6069ead2c5bbf0b7773bae0f210b))
* **api-client:** add Knowledge Graph and HLR modules (Phase 02) ([7795325](https://github.com/AnrPg/noema/commit/7795325987e0d72327af56d4bbba6a1535ad1cf7))
* **api-client:** add Session Service module (Phase 02) ([1bdb171](https://github.com/AnrPg/noema/commit/1bdb1716edcda62aea82b84dd29eb133595eef08))
* **api-client:** enhance Scheduler module with Phase 02 planning endpoints ([cde3510](https://github.com/AnrPg/noema/commit/cde3510748b15fb3f9a50ca05c0c57b13f2fafaa))
* **api-client:** expose card import preview and execution APIs ([ed105ca](https://github.com/AnrPg/noema/commit/ed105ca31a4c8d636beb00d04e0d0918d3d28cc6))
* **api-client:** expose scoped PKG CKG comparison queries ([87d23c3](https://github.com/AnrPg/noema/commit/87d23c34a72ec2d904040d3b709436d5e448fcd0))
* **api-client:** T11.0c  user admin mutations, CKG audit trail, cancel/revision hooks ([aaee23b](https://github.com/AnrPg/noema/commit/aaee23b76336238f4c7fdb384c7334c3bf8c6c72))
* **auth:** add authentication context and guard components ([f1b8845](https://github.com/AnrPg/noema/commit/f1b8845b0001ee7c411f8288d3d9f8612d23cb8e))
* **auth:** add isSessionExpired state + setSessionExpired action to auth store ([7e49a17](https://github.com/AnrPg/noema/commit/7e49a173dc0b121e0acec1cc6a677bfccad03722))
* **ckg-service:** support reviewable ontology imports and canonical skill nodes ([8b5ea46](https://github.com/AnrPg/noema/commit/8b5ea4673f70f1892b1f42ac8bc7feef779cdcf8))
* **ckg-ui:** make mutation review queues reflect bulk and retry state ([4cb766a](https://github.com/AnrPg/noema/commit/4cb766a4f4898117423021aec1cec67be4b84691))
* **content-service:** add API-first card import pipeline ([a63cf83](https://github.com/AnrPg/noema/commit/a63cf83f9f28da87864e3e407db25d0cf83bb6ec))
* **content-service:** add GET /v1/cards/batch/recent endpoint ([d233666](https://github.com/AnrPg/noema/commit/d2336669b199572f04944a70a88df83012353da9))
* **content-service:** add rate limiting, body size limits, content deduplication, and XSS sanitization ([3d46b05](https://github.com/AnrPg/noema/commit/3d46b05d5f3d09e391da8fa55e8f91fe91689ba7))
* **content-service:** harden API with type-specific validation and new endpoints ([fbaf1b9](https://github.com/AnrPg/noema/commit/fbaf1b940d74fa397cf098a3ce0b442a7e963457))
* **content-service:** implement content service vertical slice ([2f0a0f1](https://github.com/AnrPg/noema/commit/2f0a0f1d85080038ae84e35dcdf1bcfdc51dee66))
* **content-service:** make card creation study-mode aware ([c24bae2](https://github.com/AnrPg/noema/commit/c24bae27ba7f3d84b6e125c2339666f24151cb56))
* **content-service:** Phase 4  full-text search, Redis cache, cursor pagination ([7f023d7](https://github.com/AnrPg/noema/commit/7f023d7f984aedf719a7ed7a08bf8abf8d6da7ee))
* **content-service:** Phase 5  OpenAPI docs, restore, version history, stats, MinIO health ([8300c69](https://github.com/AnrPg/noema/commit/8300c69422f433c31c331f62936eaacf6974a021))
* **content-service:** Phase 6  event consumers, agent hints, cross-service reactivity ([7211170](https://github.com/AnrPg/noema/commit/72111705b032c71225455e403ac995a68e81463f))
* **content-service:** rewrite api-client content types  42 interfaces, CardContentByType ([c53988b](https://github.com/AnrPg/noema/commit/c53988b1ec9135551ee243fd9f8b9982acbcd442))
* **content-service:** support per-record import metadata ([87f6743](https://github.com/AnrPg/noema/commit/87f67433f661e568f44c8a051dff6590fa0c0709))
* **content:** expose template list route ([6a9b46f](https://github.com/AnrPg/noema/commit/6a9b46f1f0a1be20d9f5d7be92e17d8b81a82d0f))
* **contracts:** add ontology import client contracts ([7be0178](https://github.com/AnrPg/noema/commit/7be01784a6218a969c441b560aaa54359ef9d737))
* **contracts:** add universal health check contract ([70eb4f6](https://github.com/AnrPg/noema/commit/70eb4f67fb09c53d7387e33111829b162e075014))
* **contracts:** align tool runtimes ([1fb5355](https://github.com/AnrPg/noema/commit/1fb5355bb5526e8b29f658540a3d93fba7847b35))
* **contracts:** extend ontology import client bindings ([6ed4575](https://github.com/AnrPg/noema/commit/6ed4575ab9e548f6bd492033c3a774051f4be853))
* **core:** introduce active study mode contracts ([7e453e2](https://github.com/AnrPg/noema/commit/7e453e258c8bb0623339b1b220fb8833a4c9e702))
* enhanced registration page with multi-step wizard, timezone map, and trie-based country selector ([c0ef824](https://github.com/AnrPg/noema/commit/c0ef8249ae62e85c5037a484930566ff00c32f26))
* **events:** implement Phase 2 event consumers & cross-service data flow ([d7d49ef](https://github.com/AnrPg/noema/commit/d7d49ef7f0fe68a362e9f4e3436ef88551faea71))
* first commit ([8ae0c78](https://github.com/AnrPg/noema/commit/8ae0c786cda3a0aded83352c73e5b5092e05e049))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* **graph:** stabilize CKG browsing, focus behavior, and label controls ([219fb40](https://github.com/AnrPg/noema/commit/219fb40e573cf312865f93420404731f9c53e9c7))
* **graph:** T11.0a  @noema/graph package scaffold with OverlayType/LayoutMode types ([27ed7fe](https://github.com/AnrPg/noema/commit/27ed7fe07919229520583186ba79126999dea4cd))
* **graph:** T11.0b  move graph components to @noema/graph, add barrel re-exports in apps/web ([2e8a054](https://github.com/AnrPg/noema/commit/2e8a054bed8b09415f2a862a00bfe8a1ec25b6ad))
* harden auth and add session seed ([449b3e0](https://github.com/AnrPg/noema/commit/449b3e0d17ea76829c9bbe3ed390f46833c89691))
* **hlr-sidecar:** add HLR Python sidecar ([7279e85](https://github.com/AnrPg/noema/commit/7279e85e74030762020739849575676bd2ab14d6))
* implement adaptive session orchestration across services ([81a3076](https://github.com/AnrPg/noema/commit/81a3076b3b125724e9bc2e5ede841779d5a9b678))
* implement pkg system-guided knowledge workflows ([36368ff](https://github.com/AnrPg/noema/commit/36368ff873bd30a16dc6904bfe65c17c3f53c82f))
* implement session service with contracts-first approach ([b24eb68](https://github.com/AnrPg/noema/commit/b24eb686014e720cc1b3aa3efb11cb68800fd7ea))
* **imports:** polish ontology import run review workflows ([e29bae6](https://github.com/AnrPg/noema/commit/e29bae60f8db873788e120200b2da66a1f76a37b))
* introduce ProposerId type to allow admin CKG mutations ([903f419](https://github.com/AnrPg/noema/commit/903f41924c356f27a919f71094483760d2e9fcde))
* **kg-service:** expand ontology import operations ([2c587ed](https://github.com/AnrPg/noema/commit/2c587ed9ad8f0664e1b12d42cf2fb78c1e0a8b7c))
* **kg:** add CKG authoring and enrichment contracts ([1ced28d](https://github.com/AnrPg/noema/commit/1ced28d304d9da7ebdca6a5db2ad1b5d1f6d80df))
* **kg:** add ontology import pipeline backend ([6df79f1](https://github.com/AnrPg/noema/commit/6df79f1a81720293c4e88e8a2721b42a088e97de))
* **kg:** complete batch 6 review workflows and merge scoring ([e253dcc](https://github.com/AnrPg/noema/commit/e253dcca834d49f47227fb163a83ea03bf6dc6a3))
* **knowledge-graph-service:** add 18 MCP tools for agent discovery and execution ([cccae5b](https://github.com/AnrPg/noema/commit/cccae5bd96a184a879995857fa228447f18934b4))
* **knowledge-graph-service:** add CKG reset tooling ([86ae92b](https://github.com/AnrPg/noema/commit/86ae92b25441db96e177f202155acfd2fd71d0b8))
* **knowledge-graph-service:** add import-run mutation queue filtering ([ba804b4](https://github.com/AnrPg/noema/commit/ba804b41cb9d95d456ba51f16c154b190af23a2c))
* **knowledge-graph-service:** add KG schema enhancements and CKG revision flow (Phase 6) ([94e5bda](https://github.com/AnrPg/noema/commit/94e5bda6d87b994b3499a3221207ec25c461711a))
* **knowledge-graph-service:** add mode-scoped graph read models ([bf417ec](https://github.com/AnrPg/noema/commit/bf417ec5594b0807f693b88ba5b4102d9bebdd42))
* **knowledge-graph-service:** add Phase 3 domain layer ([3c24b6e](https://github.com/AnrPg/noema/commit/3c24b6e4df97125439c690fea797f5fff0fc8513))
* **knowledge-graph-service:** add Phase 8c structural analysis endpoints ([afbbfc9](https://github.com/AnrPg/noema/commit/afbbfc917bc87381984714097c44dc4edc429c8c))
* **knowledge-graph-service:** add Phase 8d ordering and ranking endpoints ([d0dcda1](https://github.com/AnrPg/noema/commit/d0dcda188daeb7eae92cd97dd5e4f161d2350164))
* **knowledge-graph-service:** add Phase 8e ontological guardrails ([8fbc534](https://github.com/AnrPg/noema/commit/8fbc534c0019fd71b5227da9256fb2f0d106eb34))
* **knowledge-graph-service:** add relational traversal endpoints (Phase 8b) ([7a58abb](https://github.com/AnrPg/noema/commit/7a58abbb6b9efc1d5d750ddef40ca4695e965bb2))
* **knowledge-graph-service:** bootstrap Phase 1 project infrastructure ([296a036](https://github.com/AnrPg/noema/commit/296a03623408b8a33bc5103d1e9cb4d50babaa8c))
* **knowledge-graph-service:** expand canonical search and authoring ([9427f16](https://github.com/AnrPg/noema/commit/9427f1668b3e5be989bf695e76c59a63a6b884ee))
* **knowledge-graph-service:** implement Phase 4 repositories ([a332eb8](https://github.com/AnrPg/noema/commit/a332eb8d598e13dad1f3dbfe41458ecf2a4300bd))
* **knowledge-graph-service:** implement Phase 5 PKG operations service layer ([caa1413](https://github.com/AnrPg/noema/commit/caa14136ebe362fb145111b6ff96a6524938a785))
* **knowledge-graph-service:** resolve Phase 8f tech debt and wire DI composition root ([b6c2e00](https://github.com/AnrPg/noema/commit/b6c2e0078b1a7f78c8f97ac5e0dad2725ffe9f96))
* **knowledge-graph-service:** scope comparison to engaged canonical hops ([002308e](https://github.com/AnrPg/noema/commit/002308e4feba269e0bf0e9fdfa1ef06adbdfbc28))
* **knowledge-graph-service:** scope comparison to engaged canonical hops ([a14fd28](https://github.com/AnrPg/noema/commit/a14fd28778eaed155315b0a89cb952407e25d07b))
* **knowledge-graph:** add CKG mutation pipeline with typestate machine ([4ae5756](https://github.com/AnrPg/noema/commit/4ae5756afe73c01d64cc99771cdb25236cdae918))
* **knowledge-graph:** implement Phase 7 structural metrics & misconception detection ([f1611bf](https://github.com/AnrPg/noema/commit/f1611bfa1f1f864ce84376c8094f2000aabae848))
* make country field required in registration ([52d0ae8](https://github.com/AnrPg/noema/commit/52d0ae8b744001203c9c02b088788616b65df72b))
* **metacognition-service:** add mental-debugger types ([9e92239](https://github.com/AnrPg/noema/commit/9e9223986d6b7e6320b4cf6438d58d154734d981))
* Phase 11  Admin App (Governance & Content Oversight) ([927d942](https://github.com/AnrPg/noema/commit/927d9421234fc50d3cd6a722d8c73793355f5fb6))
* preserve current workspace changes ([94c3494](https://github.com/AnrPg/noema/commit/94c349459390000ce282f9a93e56b80d78ea916e))
* refine graph focus behavior and collapsible dashboard shell ([a9b0880](https://github.com/AnrPg/noema/commit/a9b0880b5f817af396f6189a97999418c7ca8147))
* replace batch operations with an explicit import wizard ([f690d85](https://github.com/AnrPg/noema/commit/f690d85436c833b108156c7897b9939dde483a3b))
* **scheduler-service:** add mode-scoped progress read models ([3c10e55](https://github.com/AnrPg/noema/commit/3c10e559cafb056b99addb9b674f27a5ac2314eb))
* **scheduler-service:** add phase 6 observability, backpressure state, and runbook ([c1aabe4](https://github.com/AnrPg/noema/commit/c1aabe47596d5c1a3d759d13335e5720e5256583))
* **scheduler-service:** add read API, review forecast, and review windows enhancement ([cac91e5](https://github.com/AnrPg/noema/commit/cac91e55ab239bc682311c3f56622ad58cf3007a))
* **scheduler-service:** expand scheduler MCP tool surface for phase 4 ([60fc5fa](https://github.com/AnrPg/noema/commit/60fc5faa664dfa0b78df110fe00c696c4efaef06))
* **scheduler-service:** harden identity, auth scope, and consumer delivery ([3c4f879](https://github.com/AnrPg/noema/commit/3c4f879f588791681232b571499b0788ef0aaa22))
* **scheduler-service:** implement Phase 1 operational scaffolding ([c68955e](https://github.com/AnrPg/noema/commit/c68955e9821ae3953d151a07e7f5e38c7e8ac427))
* **scheduler-service:** implement phase 3 persistence and idempotent ingestion ([2dfabf1](https://github.com/AnrPg/noema/commit/2dfabf18b8d31aab8f5a0b7ca738c0041b9d4689))
* **scheduler-service:** implement phase 5 event reliability handshake ([ed68d55](https://github.com/AnrPg/noema/commit/ed68d55c65aa942464d62e00485c2bb6cf5a254f))
* **scheduler:** add card projection ([6a8fe89](https://github.com/AnrPg/noema/commit/6a8fe89d99047fa3b87477c900425ed942b51f28))
* **scheduler:** define API-first scheduler OpenAPI contract ([70d1949](https://github.com/AnrPg/noema/commit/70d19498e9c52d7667c083d8fac878f4faf1fee7))
* **scheduler:** implement Phase 3 FSRS/HLR runtime integration and state machine ([d48c04e](https://github.com/AnrPg/noema/commit/d48c04e6dc569c2233efd4a19e3a114c8b9c84c2))
* **session-service:** add cohort handshake lifecycle ([789e3d7](https://github.com/AnrPg/noema/commit/789e3d7d926c5a86e5aa1276c5c3164a78742db3))
* **session-service:** add offline token replay protection ([31e1090](https://github.com/AnrPg/noema/commit/31e1090914a4191b224f287ec8e187dad536bf8c))
* **session-service:** add session enhancements and study streak (Phase 5) ([37943d6](https://github.com/AnrPg/noema/commit/37943d643ffefe81ccdea8cfbef09ab20eadefe4))
* **session-service:** enforce active session concurrency policy ([7a2e098](https://github.com/AnrPg/noema/commit/7a2e0989aa1c469e79ff2f1dc3dd45264cb9704a))
* **session-service:** enhance auth middleware for secure startup ([84e4f06](https://github.com/AnrPg/noema/commit/84e4f060fc95b16b4d11885de9e36ce7e9099b2a))
* **session-service:** harden outbox reliability worker ([e2c6062](https://github.com/AnrPg/noema/commit/e2c6062b7c30b20eb2d928417937e44572371e30))
* **session-service:** scope sessions and streaks by study mode ([1781226](https://github.com/AnrPg/noema/commit/1781226cb8e4b4a6749b3a76f8efa3e511894b45))
* **shared:** add knowledge-graph domain types, events, and validation schemas ([1425719](https://github.com/AnrPg/noema/commit/142571990e671063428b64d40946b0db248daf9a))
* **shared:** expand auth and client support for local workflows ([4bc7073](https://github.com/AnrPg/noema/commit/4bc70732cce4298e052656d214e9c8de15e06f0c))
* **study-mode:** unify mode control and local-day guidance ([b46f390](https://github.com/AnrPg/noema/commit/b46f390181ab218a03842e103fbb949c5ee66df2))
* T6 flip-style card renderers (5 types) + wire RENDERER_MAP ([ed84a92](https://github.com/AnrPg/noema/commit/ed84a9256a2da9c56ba74e48aa091d888b0e89cb))
* **types,events:** add session and scheduler shared type system ([47af661](https://github.com/AnrPg/noema/commit/47af6615baece7e35aff8a1064b6ada72137fbd7))
* **ui:** add ConfidenceMeter with controlled/display modes (Phase 01) ([1f92740](https://github.com/AnrPg/noema/commit/1f9274034bf22f63eb75f9193eb804470256fa6d))
* **ui:** add MetricTile stat card with sparkline (Phase 01) ([f199474](https://github.com/AnrPg/noema/commit/f199474aa70f462d60fcb2fe7f14dc337bc4c55e))
* **ui:** add NeuralGauge SVG arc component (Phase 01) ([78f21d7](https://github.com/AnrPg/noema/commit/78f21d753f45d52de394649a1084d3e6ff75de9e))
* **ui:** add neuroscience color palette  6 families × 6 shades (T0.1) ([88e9b28](https://github.com/AnrPg/noema/commit/88e9b28aad249a7d6a00bb93e2bdaeb3a1b81afa))
* **ui:** add ProgressRing concentric SVG rings (Phase 01) ([ace38d4](https://github.com/AnrPg/noema/commit/ace38d42eba8812e69185c3197b7fde7025d3aed))
* **ui:** add PulseIndicator breathing status dot (Phase 01) ([5e11b72](https://github.com/AnrPg/noema/commit/5e11b72365dd31b84c0dfbaa49fce0f6903675f8))
* **ui:** add shared ColorFamily type and extend eslint test coverage ([8d93856](https://github.com/AnrPg/noema/commit/8d93856629445ff927d950f25793e561b6bc4734))
* **ui:** add shared UI component library ([7d49fcc](https://github.com/AnrPg/noema/commit/7d49fcc1a850e3519b44f2ced60e1bbcbefa89d4))
* **ui:** add Skeleton and EmptyState feedback components (Phase 01) ([ba543d5](https://github.com/AnrPg/noema/commit/ba543d51f64d69e08020cfe6514d32f816464845))
* **ui:** add StateChip with 5 default state maps (Phase 01) ([9e105f6](https://github.com/AnrPg/noema/commit/9e105f619afffc7441224b08971534b3620955fb))
* **ui:** animation tokens  pulse-glow, fade-slide-in, ring-fill, particle-flow, shimmer (T0.4) ([3558285](https://github.com/AnrPg/noema/commit/3558285113aaf0132a9d8c2345665a86f0da4787))
* **ui:** register neuroscience color families in Tailwind config (T0.6) ([bf77a1c](https://github.com/AnrPg/noema/commit/bf77a1c027459f797769f6867b72bbb2d4f45986))
* **ui:** spacing tokens  section, card-gap, inset, tight (T0.3) ([4d70cd3](https://github.com/AnrPg/noema/commit/4d70cd300e13e966d3b1951cf4fc19cd86ca3fda))
* **ui:** ThemeProvider + useTheme hook  localStorage, dark default, server sync prop (T0.5) ([0e7cc46](https://github.com/AnrPg/noema/commit/0e7cc461be1a9ab03b0c7a00c3478b1e3cbbe159))
* **ui:** typography scale  JetBrains Mono + named text utilities (T0.2) ([f401133](https://github.com/AnrPg/noema/commit/f4011337eef3653cf37e086335078953ca506f11))
* **ui:** wire barrel exports and package.json sub-paths (Phase 01) ([33f5bc1](https://github.com/AnrPg/noema/commit/33f5bc118822f8bb22edaeb836200bb021a1ebcf))
* **user-service:** add admin user management endpoints (Phase 4) ([92a73cf](https://github.com/AnrPg/noema/commit/92a73cf3db510f9d2380a9ed2cdc5ad4a7763e3e))
* **user-service:** add CORS support ([49d03c5](https://github.com/AnrPg/noema/commit/49d03c5a1c6b7d3a4f0edd26da71773d666adea4))
* **user-service:** add initial database migrations ([1bf06e2](https://github.com/AnrPg/noema/commit/1bf06e27ac3b8a41b6f24d5f8578577b4dc3f64f))
* **user-service:** implement Phase 1  JWT scopes, account security flows ([28263db](https://github.com/AnrPg/noema/commit/28263db5bce34d0835570c5ecf5bfc4609676a52))
* **user-service:** implement user service with full CRUD operations ([6566268](https://github.com/AnrPg/noema/commit/656626888d0aca08cd3fbe5868c8bc719a2e9669))
* **user:** require languages for every profile ([cac8d98](https://github.com/AnrPg/noema/commit/cac8d9816941a86c6331c036247088f0af6fcb17))
* **web-admin:** add admin dashboard application ([379ca9e](https://github.com/AnrPg/noema/commit/379ca9e5a4114609eb83fc2ac77ef0d4f83a3ea2))
* **web-admin:** add graph-native CKG authoring workflows ([97dca68](https://github.com/AnrPg/noema/commit/97dca68bd439d5518cb855a6878dd4c678fb4dcd))
* **web-admin:** add ontology import review workspace ([5344e05](https://github.com/AnrPg/noema/commit/5344e05f94b97ded8d66cc5a1c9daec70c68a332))
* **web-admin:** expand CKG authoring and recovery flows ([34c97b1](https://github.com/AnrPg/noema/commit/34c97b1bf2c6d9755d0b95872f01f3549d1a5ec9))
* **web-admin:** implement sessions list+detail pages, restore AdminCardBrowser View link ([597d046](https://github.com/AnrPg/noema/commit/597d046b64629592f3c30acb6bbd551144571d74))
* **web-admin:** improve ontology import controls ([9d023dc](https://github.com/AnrPg/noema/commit/9d023dc2c08d7fe0e26fd3d7dd5eaf750111f652))
* **web-admin:** mature ontology import operator workflows ([7ea48c6](https://github.com/AnrPg/noema/commit/7ea48c66b4af06db2e50a9f7f3edd82eaaf2a7ec))
* **web-admin:** T10 remediation renderers group A (7 comparison/boundary types) ([fd72237](https://github.com/AnrPg/noema/commit/fd7223757c07d0e744ae4315536a846f3096a9d6))
* **web-admin:** T11.1  dashboard MetricTile row, pending actions, recent activity feed ([65b672b](https://github.com/AnrPg/noema/commit/65b672ba5af2808aa9928f104dd54270bd29090c))
* **web-admin:** T11.2  user list filters + role pills, user detail admin actions panel ([a58233e](https://github.com/AnrPg/noema/commit/a58233edd305161b1eae3a2ed9cda04867ab5e17))
* **web-admin:** T11.3  CKG mutation queue, detail, graph diff, audit trail, actions panel ([be559cb](https://github.com/AnrPg/noema/commit/be559cb26009808467c2faabb9caf0adb500f03c))
* **web-admin:** T11.4  CKG Graph Browser with pending_mutations overlay ([e8d818f](https://github.com/AnrPg/noema/commit/e8d818f4698d2a79eab913131dd8b023dcfc1f6f))
* **web-admin:** T11.5  Content Oversight, AdminCardBrowser, templates CRUD ([e04cb11](https://github.com/AnrPg/noema/commit/e04cb11fd9250205eca3b045a322ec5200aa50a2))
* **web-admin:** T11.6  5-group sidebar nav with dendrite green accent ([1ea1ee3](https://github.com/AnrPg/noema/commit/1ea1ee321413a48c95e9c8b7b3534fabc7a5a6ab))
* **web,api-client:** R13  implement forgot-password flow and misconception confidence ([4f3e2a2](https://github.com/AnrPg/noema/commit/4f3e2a25c0fd8785b5a46fd8e70595149ccff16f))
* **web:** add Active Session page at /session/[sessionId] ([b6c927a](https://github.com/AnrPg/noema/commit/b6c927aad932987b38e72a64f9a293c8b3e33c8f))
* **web:** add Card Library to Learning nav group ([1b36cd2](https://github.com/AnrPg/noema/commit/1b36cd214fdb41fe448dba8241a3d8986f61645c))
* **web:** add card-side PKG authoring workflow ([d8219c2](https://github.com/AnrPg/noema/commit/d8219c26aa3b161dfe38878923183d306256a808))
* **web:** add CognitiveVitals row with live data from 4 services ([8489806](https://github.com/AnrPg/noema/commit/848980615d77c9bd3cc0b6d6c59857edd3b0b7d7))
* **web:** add CopilotSuggestions preview from Zustand store ([3623f12](https://github.com/AnrPg/noema/commit/3623f12efe1bc27925be53bc0e939a268d4464f8))
* **web:** add fade-slide-in animation for dashboard stagger ([d8075a3](https://github.com/AnrPg/noema/commit/d8075a32fc0d56c7cd6908d71a758a21c947d1b0))
* **web:** add graph hubs and placeholder routes ([64840de](https://github.com/AnrPg/noema/commit/64840def08bf8cb46952fa1941c3b63f47569545))
* **web:** add graph node picker ([fc4853d](https://github.com/AnrPg/noema/commit/fc4853de33881c227f25375c7833b22160204159))
* **web:** add KnowledgePulse mini force-directed SVG graph ([43f830c](https://github.com/AnrPg/noema/commit/43f830cfce189ec03a7deb9b03187f90fce73f03))
* **web:** add LaneMixSlider component ([f13cbb6](https://github.com/AnrPg/noema/commit/f13cbb6edc9b1779739b87ec124c12ac772270b5))
* **web:** add main web application for learners ([c6b78b7](https://github.com/AnrPg/noema/commit/c6b78b7b7c9a89cb4eb3924e2c95c3564b37bf1b))
* **web:** add ModeSelector component for session start ([68e8762](https://github.com/AnrPg/noema/commit/68e8762b413b3c3107be55425341ba93ae068036))
* **web:** add non-dismissable session expiry modal on 401 + auth reset ([94ae48a](https://github.com/AnrPg/noema/commit/94ae48a150963a49d0e2d872e756834897cdb49f))
* **web:** add PauseOverlay and AdaptiveCheckpoint components ([2c88e39](https://github.com/AnrPg/noema/commit/2c88e391c1527d83c3c961fb7a9838be2d2fc676))
* **web:** add post-login deep-link redirect preservation via ?redirect= param ([908786b](https://github.com/AnrPg/noema/commit/908786bc7ed0fabb808c7c9f4d82747656ced6f7))
* **web:** add PreAnswerConfidence and ResponseControls components ([7a592a7](https://github.com/AnrPg/noema/commit/7a592a76712392383d2bbfa602d2a549e4e2c35f))
* **web:** add RecentSessions panel with state chips and progress gauge ([5cc0746](https://github.com/AnrPg/noema/commit/5cc0746aa1d5884eb0bca5ddd7968c03f46e535b))
* **web:** add ReviewForecast 7-day segmented bar chart ([e840cde](https://github.com/AnrPg/noema/commit/e840cde5087183c272939462a5ff12f39f1d09ab))
* **web:** add Session History page and Sessions nav item ([86d28e4](https://github.com/AnrPg/noema/commit/86d28e44c621cdecd01da6005f92d2af9161b1e9))
* **web:** add Session Start page at /session/new ([4bbf95a](https://github.com/AnrPg/noema/commit/4bbf95aa2a5125f4b8260a2a164f7d425b9231d7))
* **web:** add session summary components ([5b7871c](https://github.com/AnrPg/noema/commit/5b7871cd36c69c90ef2ce9247d192f186c0793eb))
* **web:** add Session Summary page at /session/[sessionId]/summary ([4857fb9](https://github.com/AnrPg/noema/commit/4857fb99cb4e1eff31c644d4e898f337b6ee5838))
* **web:** add SessionBar component ([860d0d8](https://github.com/AnrPg/noema/commit/860d0d875d272ebadb9b9576500a6f2cf91b7854))
* **web:** add T3.1 Zustand stores (session, graph, schedule, copilot) ([55cc851](https://github.com/AnrPg/noema/commit/55cc851b0b9df4f0d8e37c91b080be8f50f83af4))
* **web:** add T3.2 agent hints interceptor wired into providers ([d6ec301](https://github.com/AnrPg/noema/commit/d6ec301db593b42774c777fcfcf0c3eb16895c88))
* **web:** add T3.3 command palette with Cmd+K global shortcut ([13764de](https://github.com/AnrPg/noema/commit/13764dede8cd462ea5b4add5e2835cc17e44520d))
* **web:** add T3.4 keyboard shortcut system with Shift+? reference panel ([cecf303](https://github.com/AnrPg/noema/commit/cecf30385c095f5fa27f6cd51123fa72ee338596))
* **web:** add T3.5 SectionErrorBoundary component ([91de889](https://github.com/AnrPg/noema/commit/91de889b5af586ab77bfc670e068780770c9154a))
* **web:** add T3.6 toast manager with success/error/info/warning variants ([f0849d6](https://github.com/AnrPg/noema/commit/f0849d61ae3137cbb1172493c2ed251be463219d))
* **web:** add zustand and radix dialog deps for phase 03 ([fc3d6df](https://github.com/AnrPg/noema/commit/fc3d6df3548027b841abf0643d999681d47b2d3c))
* **web:** apply engagement scoped knowledge graph views ([ea48249](https://github.com/AnrPg/noema/commit/ea482493a509f9d940e88fbcfcf652fc55edc264))
* **web:** auth pages visual refresh with neuroscience palette and forgot-password ([21c02ec](https://github.com/AnrPg/noema/commit/21c02ecf66f3b64b0aa11a41f51b284f2a439724))
* **web:** card renderer infrastructure  types, CardShell, FallbackRenderer, factory stub ([505e13b](https://github.com/AnrPg/noema/commit/505e13b35c48d2a298fb07e96585e312911b4c6d))
* **web:** compose Phase 05 Cognitive Vitals dashboard (Thalamus) ([0595dcf](https://github.com/AnrPg/noema/commit/0595dcfd2e3e1b123de306e74ac9512c8e0172d7))
* **web:** dev token gallery at /dev/tokens  all Phase 00 tokens visible (T0.6) ([b896638](https://github.com/AnrPg/noema/commit/b896638acd48a36dafe32953b6175b3e01f4dfe1))
* **web:** full profile page with view/edit mode, useMe() data, and optimistic locking ([057e9ff](https://github.com/AnrPg/noema/commit/057e9ff843cdace09260854ab74d317be3893847))
* **web:** full settings page with section-by-section saves, theme toggle, and username-gated delete ([fd4cfee](https://github.com/AnrPg/noema/commit/fd4cfeeef6ec96e4dfcb22f2aa03fcf8502c6e14))
* **web:** Phase 08  Knowledge Graph (Connectome) ([20b65e6](https://github.com/AnrPg/noema/commit/20b65e6e3289894a3cd09faade76b7a35209cb97))
* **web:** refresh learner and admin dashboard flows ([895611c](https://github.com/AnrPg/noema/commit/895611c63ad50c8c5fcf1e723654b4b98fe44bac))
* **web:** surface mode-aware study guidance ([b572669](https://github.com/AnrPg/noema/commit/b5726699676373dad86c5bd64b726cf5ede4bbde))
* **web:** T10.A  copilot store freshness tracking, fade-expiry, unread count ([1f86090](https://github.com/AnrPg/noema/commit/1f8609029e28feb0cb00f9d0da70a91bcce6a225))
* **web:** T10.B  CopilotSidebar shell, CopilotToggle floating button ([1baae99](https://github.com/AnrPg/noema/commit/1baae9934269ba2f4e9b60a3980a82543f8ccf69))
* **web:** T10.C/E  SuggestedActions, TransparencySection, AlternativesWarnings + sidebar wiring ([5eecaa1](https://github.com/AnrPg/noema/commit/5eecaa1e6c09b7a29c6c1ecc0fcf923ce1e55573))
* **web:** T10.D  RiskAlerts section, severity-filtered, sorted ([33ff1e8](https://github.com/AnrPg/noema/commit/33ff1e8fdc7407958e878b77d089f67bad8b615b))
* **web:** T10.F  barrel export, wire CopilotSidebar+Toggle into layout, See-all link ([3d4afc0](https://github.com/AnrPg/noema/commit/3d4afc08d1b2a34aa36ec54c2546aeb5313c4c5f))
* **web:** T11  remediation group B (6 metacognitive renderers) ([58cbb77](https://github.com/AnrPg/noema/commit/58cbb77197c463e5eca8f743bca8a83d267846f1))
* **web:** T12  remediation group C (all 42 card types now have concrete renderers) ([f648ab4](https://github.com/AnrPg/noema/commit/f648ab4765202308c367dc1ba0ae4a68b32d2993))
* **web:** T13  DeckQueryFilter controlled component ([6830892](https://github.com/AnrPg/noema/commit/6830892359f205b0f9048202d42612ba3de7e9b5))
* **web:** T14  CardCollection with grid/list/multiselect/bulk-action-bar ([87391ed](https://github.com/AnrPg/noema/commit/87391ed08fd3929dc32ea3f372946a014b062e89))
* **web:** T15  MediaUploader with presigned PUT, progress tracking, error handling ([29d21f3](https://github.com/AnrPg/noema/commit/29d21f303ccb2a527c4f00e27ca4c4c56ac7155b))
* **web:** T16  Card Library page (/cards) ([e66cade](https://github.com/AnrPg/noema/commit/e66cade2048322e12cb57c418e1859a4a70a2dae))
* **web:** T17  Card Creator wizard (/cards/new) ([c270df8](https://github.com/AnrPg/noema/commit/c270df898543bad2a59978e91304ae53806f9e29))
* **web:** T18  Card Detail page (/cards/[id]) with view/edit/delete/state-transition ([9665d88](https://github.com/AnrPg/noema/commit/9665d8812715af0d044d7b9e4b84023db18f11f9))
* **web:** T19  Batch Operations page (/cards/batch) ([f7f2868](https://github.com/AnrPg/noema/commit/f7f28681226ea2afd37244ac243ed0a41d0dacc9))
* **web:** T7  sequence/fill renderers (cloze, matching, ordering, process, timeline, cause-effect) ([3170573](https://github.com/AnrPg/noema/commit/3170573f6bf118a3d7655de659d72c125891f6c5))
* **web:** T8  media card renderers (image-occlusion, audio-card, diagram, multimodal) ([0ef0389](https://github.com/AnrPg/noema/commit/0ef038917ca45b48f76facd96d03ad0203dfc404))
* **web:** T8.1  GraphCanvas, GraphLegend, GraphMinimap, node/edge draw helpers ([8b9d2d2](https://github.com/AnrPg/noema/commit/8b9d2d2b150ff184374998beb7815efeab78f301))
* **web:** T8.2  PKG Explorer page, GraphControls, NodeDetailPanel, knowledge layout ([ba77634](https://github.com/AnrPg/noema/commit/ba776340afb72ddf1a072bf55a0a03ce3f2d3eb8))
* **web:** T8.3  Structural Health Dashboard, RadarChart, MetricDrillDown ([a464efb](https://github.com/AnrPg/noema/commit/a464efb2d244b9613137ddda1e9fe26498fc9fa8))
* **web:** T8.4  Misconception Center, MisconceptionPipeline, MisconceptionSubgraph ([28cc179](https://github.com/AnrPg/noema/commit/28cc1795fe6e747a1fa9dd2abd7af852663f1e39))
* **web:** T8.5  PKG/CKG Comparison page + nav items for knowledge sub-pages ([c177d39](https://github.com/AnrPg/noema/commit/c177d39c1ddbca8803b7da9678f7ec376b0db473))
* **web:** T9  7 complex reasoning renderers + wire RENDERER_MAP ([60b5c0d](https://github.com/AnrPg/noema/commit/60b5c0d7fb1f0c9a71b6ab80c530722a7608c51c))
* **web:** T9.1  Reviews Dashboard, TodaysPlan, ReviewForecastFull, ReviewWindows ([fd2ab26](https://github.com/AnrPg/noema/commit/fd2ab265911c9c52964929d1bf077ffd968a5046))
* **web:** T9.2  CardScheduleInspector, RecallTimeline, CalibrationChart ([dc307ff](https://github.com/AnrPg/noema/commit/dc307ff3530648a01f004390ad46f266e1d5eeee))
* **web:** T9.3  SchedulingSimulator what-if tool ([c7a7d5a](https://github.com/AnrPg/noema/commit/c7a7d5a9c273d009559c6bc7aa60677f5bf538af))
* **web:** T9.4  add Reviews to sidebar nav ([9c5f3ff](https://github.com/AnrPg/noema/commit/9c5f3ff2cd071fd4e2d75aac0f79f4b7e7778420))


### = Bug Fixes

* **admin:** improve admin error messaging ([51b85c8](https://github.com/AnrPg/noema/commit/51b85c8c9d77faeeedf95bbe1064ac8b1268a427))
* **api-client,web-admin:** C5  systematic cache invalidation on all mutation onSuccess ([3500761](https://github.com/AnrPg/noema/commit/3500761a39a49f34ec4221fd8600f57954e2d915))
* **api-client:** improve content types type safety (Task 1 quality fixes) ([0a11774](https://github.com/AnrPg/noema/commit/0a1177402071d5c7386536d3337441a600c3c713))
* **api-client:** normalize CKG mutation workflows ([a1d9007](https://github.com/AnrPg/noema/commit/a1d900759e9a5e015d3344345a468acc826af56a))
* **api-client:** remove duplicate api methods, fix cache key collision in useCardsByBatchId ([6c48e2a](https://github.com/AnrPg/noema/commit/6c48e2a55b6f885551f89f403111daae6828a335))
* **api-client:** remove I-prefixed backward-compat aliases from content types ([f526888](https://github.com/AnrPg/noema/commit/f5268887ad9b39142ae28743ac2edd7f9bb32d94))
* **api-client:** resolve pre-existing lint errors before Phase 02 ([a9ef708](https://github.com/AnrPg/noema/commit/a9ef70843bbe86e6c73b388741aaa06818b19039))
* **api-client:** strengthen scheduler types and add staleTime to migrated hooks ([2993d02](https://github.com/AnrPg/noema/commit/2993d029fade169a2d93dabb31ff6f6d2c7caf29))
* **auth,web:** C1 setLoading finally block, C2 SSR-safe configureApiClient, C4 remove fabricated lane stats ([874c58b](https://github.com/AnrPg/noema/commit/874c58bfd9de152acadfea3c7811ad18e10b1afc))
* **auth:** clear isSessionExpired on setUser + remove stale src declarations ([f8df561](https://github.com/AnrPg/noema/commit/f8df561e9fdb09d21a6ae09ce47e5ccb7009f7e4))
* **auth:** forward guest guard redirects ([a79c443](https://github.com/AnrPg/noema/commit/a79c44321800c17c67902df42a73bbdfd32abf0c))
* **auth:** targeted Zustand selectors, remove tokens from localStorage persistence ([52815b2](https://github.com/AnrPg/noema/commit/52815b2223b37946e6126f7dc4123ed1a02a84bc))
* break media schema cycle ([7ccefc1](https://github.com/AnrPg/noema/commit/7ccefc1e7df45588a262f495a6c7546becdcf18e))
* complete Phase 1 remediation  foundation, type safety, and error handling ([103f246](https://github.com/AnrPg/noema/commit/103f2464f092fd65528331ef2061cdcd46ae434d))
* complete Phase 1 security hardening gaps (1.2, 1.3) ([901865d](https://github.com/AnrPg/noema/commit/901865d583ed4ff4ee642968d2534a193f986b6e))
* complete Phase 2 remediation - contracts and interfaces ([771b345](https://github.com/AnrPg/noema/commit/771b34558f83f02d2c3c1b4e7388d23201ae9a21))
* **content-service:** align single-card creation with card state and difficulty ([2ad1123](https://github.com/AnrPg/noema/commit/2ad1123ada7897a68ca16624e1b8c4a3c556486d))
* **content-service:** enforce data integrity across write operations and batch APIs ([b6b5225](https://github.com/AnrPg/noema/commit/b6b522538c24b4c141f84c6833531e2d96c09f7d))
* **content-service:** use UserId branded type and remove unsafe cast in batch/recent route ([1669a11](https://github.com/AnrPg/noema/commit/1669a113a77d3fafc489ac91f96a22f55278ccdd))
* correct template migration column and add barrel export ([f192c0c](https://github.com/AnrPg/noema/commit/f192c0c8a75cadf8739623159435e2573acb78f7))
* **dev:** keep web apps in foreground on Windows ([83612e8](https://github.com/AnrPg/noema/commit/83612e8dade8bcca5f8644042723235ad9b371aa))
* **dev:** keep web+api in foreground on Windows ([168871b](https://github.com/AnrPg/noema/commit/168871bbe5e913cd1fbce5b179415aa07dc08f50))
* **dev:** run web+api via foreground turbo ([6178a65](https://github.com/AnrPg/noema/commit/6178a65e9a785a3ebadd9c02e43a8b9401a78e9a))
* **dev:** use Windows-aware workspace launchers ([5fc50cf](https://github.com/AnrPg/noema/commit/5fc50cfa6365c483e70216c9e57b4cc797a26f50))
* **graph:** add pending_mutations overlay option to GraphControls ([cb4f053](https://github.com/AnrPg/noema/commit/cb4f05394254b735ecc141465c1a6ac4120751a6))
* harden auth and API URLs ([257d15a](https://github.com/AnrPg/noema/commit/257d15a6196449a34d6707baed5ac4980be76921))
* harden cohort handshake state machine and add lifecycle tests ([65e7e94](https://github.com/AnrPg/noema/commit/65e7e94dee0104c0872f7c7fd9cf5fb96618ec9e))
* harden offline token replay protection with deferred signing, probabilistic cleanup, and concurrent-consume test ([4745088](https://github.com/AnrPg/noema/commit/4745088638e9c45fdad5c56b346df165893e1c76))
* harden outbox worker reliability with dead-letter, jitter, and drain safety ([7becb93](https://github.com/AnrPg/noema/commit/7becb93ceeba7466eb8bd9ffe73a3bc2b8f917a1))
* implement Phase 3 domain logic remediation (12 fixes) ([9f1ad76](https://github.com/AnrPg/noema/commit/9f1ad7645e1c6ff3f417056c0d5919b52684bbea))
* **imports:** align run state semantics and admin status UI ([315fd60](https://github.com/AnrPg/noema/commit/315fd60c2f7b98aa96b21563441a8af1997c344b))
* isolate Prisma client generation per service ([a8f1db4](https://github.com/AnrPg/noema/commit/a8f1db4027f40dc4a1783d9f719d16e02bba3cd0))
* **kg:** stabilize ESCO ontology imports ([f1444f0](https://github.com/AnrPg/noema/commit/f1444f020b8ff54514811c84d3aa628cb37e7726))
* **knowledge-graph-service:** align Phase 7 structural metrics with specification ([5cd3799](https://github.com/AnrPg/noema/commit/5cd37999d09a5286b596d18fb447715fc5713820))
* **knowledge-graph-service:** apply pending remediation improvements ([484b1ae](https://github.com/AnrPg/noema/commit/484b1aea8abc152e785cb5b8625a505548170654))
* **knowledge-graph-service:** close Phase 1-3 implementation gaps ([c32b4f8](https://github.com/AnrPg/noema/commit/c32b4f831d0616a5e9edbc6a88dcaf5111e78936))
* **knowledge-graph-service:** resolve all 27 Low severity findings from deep analysis ([fb87d7c](https://github.com/AnrPg/noema/commit/fb87d7cafb318a48ee38aadaa199ea53ab849642))
* normalize session client response shapes ([548c1f7](https://github.com/AnrPg/noema/commit/548c1f7bac6c93da108b098cda953671fa7426d7))
* Phase 0-11 audit  68 findings resolved across all layers ([2d918e0](https://github.com/AnrPg/noema/commit/2d918e00363cd79aa31943404206d9e022c2d6b3))
* remediate critical, high, and medium severity findings from deep analysis ([6bf48bf](https://github.com/AnrPg/noema/commit/6bf48bf084e249b2202da66fc5c48b637b101dea))
* remediation phase 5  API, config & polish (16 fixes) ([06d85c5](https://github.com/AnrPg/noema/commit/06d85c5695a92e7fac7005bee49e01bf3537de78))
* repair kg node creation and session auth gating ([2292e32](https://github.com/AnrPg/noema/commit/2292e320f47829c12aafdf96f84fb421cbc9f216))
* repair session queue loading and empty states ([8c6d6be](https://github.com/AnrPg/noema/commit/8c6d6be7ab09c3c8c34ca5a09e3bb0938dd54603))
* repair session start and scheduler preview ([7fc4a87](https://github.com/AnrPg/noema/commit/7fc4a87f7fb3f532325c5a41c8bff4f18300b4d1))
* resolve all lint errors in enhanced registration feature ([5b6ede1](https://github.com/AnrPg/noema/commit/5b6ede1ebb089754f4a19f4d5eb7f77b38971f36))
* resolve critical and high audit findings across all services ([39db93c](https://github.com/AnrPg/noema/commit/39db93c2057781f154521a770740706478e73696))
* resolve medium/low audit findings and implement deferred items ([fe2664d](https://github.com/AnrPg/noema/commit/fe2664d936fe7af27f37460005bfec57fb65e591))
* resolve P0-P1 gaps across session-service hardening phases ([b1c5efd](https://github.com/AnrPg/noema/commit/b1c5efdf9a678e10c8dea468d203efa5c7e578be))
* resolve registration, user list display, and dashboard data issues ([9c77d42](https://github.com/AnrPg/noema/commit/9c77d426a8a10cfd941eff47fdb62baef3166fc9))
* resolve user-service typecheck regressions ([4603e3b](https://github.com/AnrPg/noema/commit/4603e3baf250530250ed1727b629d041b689391f))
* resolve VS Code module resolution errors ([d95e7a8](https://github.com/AnrPg/noema/commit/d95e7a80e993dbe1ca992996be3c0445b3d10ed0))
* **scheduler:** resolve TypeScript error in Phase 3 test ([7ea4b52](https://github.com/AnrPg/noema/commit/7ea4b5250792566dc8e04c0cb985074cad942b85))
* **services:** harden local service runtime and data contracts ([fa7ce94](https://github.com/AnrPg/noema/commit/fa7ce94e888ce6867c7cf95a36fc8817b8d407a3))
* **session-service:** close session contract and lifecycle gaps ([3231d2f](https://github.com/AnrPg/noema/commit/3231d2f3832141d0c809ea5bba732bb0bc8fe524))
* **session-service:** enforce blueprint order and align attempt outcome contract ([2597326](https://github.com/AnrPg/noema/commit/259732616f46379d652ea5744d3411de5ce8e16c))
* **session-service:** harden replay guard mitigations ([f1d6bd4](https://github.com/AnrPg/noema/commit/f1d6bd4768d67d549b5eab9a2d4cac5afc23d405))
* stabilize affected CI pipeline ([b748ccd](https://github.com/AnrPg/noema/commit/b748ccd4748b000462f9c02f01ad4968ab768bf7))
* **types:** align validateIdFormat with Zod schema, typed filters, count key isolation ([72b3d00](https://github.com/AnrPg/noema/commit/72b3d00b4e7239eedf2bedeaabb576378e7ea7c9))
* **ui:** add ARIA meter/slider attributes and showLabel tests to ConfidenceMeter ([1e78c42](https://github.com/AnrPg/noema/commit/1e78c424d09e31d65e6619fd971e18994f67ce8f))
* **ui:** add JSDoc header to NeuralGauge; document animation limitations in ADR ([6d48d9d](https://github.com/AnrPg/noema/commit/6d48d9d8f84b587ae0f41892a353f35ef0ddb300))
* **ui:** add overflow=visible to sparkline SVG to prevent stroke clipping ([49915b9](https://github.com/AnrPg/noema/commit/49915b96e411a6c24b2bd972fccec5bc72333db0))
* **ui:** export IStateChipProps and split pulse cn() args for JIT safety ([29710c2](https://github.com/AnrPg/noema/commit/29710c255c9008a40919b354ee76ec039d40fd94))
* **ui:** import ReactNode explicitly in MetricTile ([4bfda29](https://github.com/AnrPg/noema/commit/4bfda294a6d7061445962edc8c7e97468eacfcf3))
* **ui:** use string literal fallback in getLabel to satisfy TS strict indexing ([7d214d5](https://github.com/AnrPg/noema/commit/7d214d502267c3d8329103790c86e58101968a12))
* **user-service:** fix pino-pretty ESM transport resolution issue ([dc0a2de](https://github.com/AnrPg/noema/commit/dc0a2dee786e2c2507a70c6a8cc9f5b444e1af67))
* **user-service:** normalize role filters in user listing ([e500bdf](https://github.com/AnrPg/noema/commit/e500bdfc8c0de00e0eab305a314dd30f637f3c1a))
* **user-service:** resolve TypeScript strict mode errors ([ba63df8](https://github.com/AnrPg/noema/commit/ba63df8e6b4c678e36d27b5cc9ce7ce668fcda61))
* **user-service:** use proper error types ([681d331](https://github.com/AnrPg/noema/commit/681d331666b0b5c8d32a6ddfa1c52b4493d7316a))
* **web-admin:** add explicit ids and names to raw form fields ([17374cb](https://github.com/AnrPg/noema/commit/17374cbec1b7451928796fe434474ab094230b96))
* **web-admin:** erase-fix audit  misconception state machine, as never casts, dead code ([a810025](https://github.com/AnrPg/noema/commit/a8100256aad26ec377a83235144519e060ee7098))
* **web-admin:** final review  broken nav links, nodeId filter, inline delete confirm ([05b96f8](https://github.com/AnrPg/noema/commit/05b96f872d0e4655c4469e9961fb0f0a1266a70b))
* **web-admin:** minor audit findings  replaceAll, sparkline, store rename, dedup, hints cap ([1b76614](https://github.com/AnrPg/noema/commit/1b76614f30a1da23785c348599c20106ebc2b0f1))
* **web-admin:** R10  silent admin-action errors; missing return types ([bab038c](https://github.com/AnrPg/noema/commit/bab038c3d43a4524e33c88821c00e93a69d48946))
* **web-admin:** R10b  return types + ?? in root app files ([87f8d1f](https://github.com/AnrPg/noema/commit/87f8d1fc025e4a480e67ecc5a2e956e77ac0e9bd))
* **web-admin:** replace unhandled mutateAsync with safe mutate in user detail page ([195d495](https://github.com/AnrPg/noema/commit/195d49515eee68ca07935cbaea01feb3602fd24c))
* **web-admin:** round-4 audit  error feedback, loading states, a11y, type safety ([73ea1f5](https://github.com/AnrPg/noema/commit/73ea1f55217dedb955eede1ebafcbd6ba0cc8540))
* **web-admin:** startsWith nav fix, user pagination, activity log, sessions count optimization ([b3af47a](https://github.com/AnrPg/noema/commit/b3af47abc635a9cde435286869030a44dbd5c7a3))
* **web-admin:** surface workflow-aware admin states ([5a85598](https://github.com/AnrPg/noema/commit/5a85598ea3d359449d32519978b20faf3cf9e4bc))
* **web-admin:** T11.0a  drop next peerDep/lucide, add lint+test scripts, fix tsconfig exclude ([51dc391](https://github.com/AnrPg/noema/commit/51dc3915afde2b6abb7d154cc500aaaadae613d9))
* **web-admin:** T11.3 quality  import order, type casts, mutation success callbacks ([dc58410](https://github.com/AnrPg/noema/commit/dc58410965eace1aafa8a25e343bc873b34ba491))
* **web-admin:** T11.4 quality  error states, casts, hoveredNodeId, eslint disables ([838dbde](https://github.com/AnrPg/noema/commit/838dbde8eb3857439b05a9646d3c5129cdd01e27))
* **web-admin:** T11.5  add label+sessionId to ICardSummaryDto, fix AdminCardBrowser columns ([d9f95e6](https://github.com/AnrPg/noema/commit/d9f95e67573dfe74df55fb91780966cc9e1fb747))
* **web-admin:** T11.5 quality  error states, per-row delete, shared format utils ([7268175](https://github.com/AnrPg/noema/commit/7268175ddd3a851fe1a8fb5805aae5d79cadcd87))
* **web-admin:** T11.6 quality  use named React type imports ([593f398](https://github.com/AnrPg/noema/commit/593f39899f5a2b3c8a63eca07506860a27c98129))
* **web,web-admin:** R11  stale eslint-disables, any casts, session mutation error handling ([d333860](https://github.com/AnrPg/noema/commit/d3338602d7e3928d0dcb56907006e575f45872ca))
* **web,web-admin:** R12  resolve remaining TODO items in admin login, toast, and UI package ([fa12c54](https://github.com/AnrPg/noema/commit/fa12c546b157c9fb6e6668509ebf9b44b3f991bb))
* **web:** add string type annotation to initials map in layout ([e722d87](https://github.com/AnrPg/noema/commit/e722d8713fd8d6f3321932a1795883cf4a8e8f36))
* **web:** align session review flow with backend contracts ([2aa615f](https://github.com/AnrPg/noema/commit/2aa615f2c309e0ba30239b24414241c4437ebc94))
* **web:** C3  remove as-any casts in session page, typed hook access, route validation, error states ([530705d](https://github.com/AnrPg/noema/commit/530705d19a84f56950fbca698ac2bedd8ccab05d))
* **web:** comparison branded types, PKG cache, misc isError handling ([005610f](https://github.com/AnrPg/noema/commit/005610fc9a02ca6e49db46f15b9102f972795d11))
* **web:** direct diffMs time units in relativeTime, document userId reservation ([34507ac](https://github.com/AnrPg/noema/commit/34507ac80b4dd1fc4e1f532ef03b0c3d561920c4))
* **web:** disable toggles during mutation, guard user null, redirect after deletion ([3dd3a83](https://github.com/AnrPg/noema/commit/3dd3a830dfff271962766228bb525896a2328e45))
* **web:** fix session expiry modal accessibility and nav order ([74fef1f](https://github.com/AnrPg/noema/commit/74fef1f3af8bf010657c52715ae28bf604e20a71))
* **web:** fix streak tile enabled guard and today-edge-case reset ([08d3166](https://github.com/AnrPg/noema/commit/08d3166cc00c4f97288eb5618d47af01b3df9140))
* **web:** forgot-password reset on retry, aria-live, remove redundant step counter ([a27c152](https://github.com/AnrPg/noema/commit/a27c15233f9d9c6bc8ed5f49d160eba9274ec7c9))
* **web:** gate error.message behind NODE_ENV and document fallback retry caveat ([4f049b6](https://github.com/AnrPg/noema/commit/4f049b60468c02b8599dd735b0fef86bcecbd671))
* **web:** guard redirect against open redirect + remove useSearchParams from public layout ([a879644](https://github.com/AnrPg/noema/commit/a8796445af95e17fadfb3d544361e2ff311324c6))
* **web:** harden keyboard shortcut system per quality review ([18f14ec](https://github.com/AnrPg/noema/commit/18f14ecba2f681f965c85ea0ab846c0b55e646d9))
* **web:** harden toast manager  HMR safety, snapshot iteration, warning variant note ([d31b3a0](https://github.com/AnrPg/noema/commit/d31b3a009fc960c109e905c336cc1349fca3e1de))
* **web:** implement KG context menu actions, fix health radar fallback, misconception button guards ([a83b1b9](https://github.com/AnrPg/noema/commit/a83b1b9eb3b475e506a7107b35e9a57f6dac93c3))
* **web:** local-timezone bucketing, enabled guards, streak constant in cognitive vitals ([31e36e6](https://github.com/AnrPg/noema/commit/31e36e6d50838336f0d575688ea23671dec06c71))
* **web:** move UserId alias after imports, document dismissed filter in vitals ([5e518f3](https://github.com/AnrPg/noema/commit/5e518f3b3021e4a8729718577d37a84362a1b9de))
* **web:** Phase 10 typecheck  sort casts, Icon type, explicit map param types ([721a62c](https://github.com/AnrPg/noema/commit/721a62c32632bd19c5bedab4bc59505c6b0a68e1))
* **web:** prevent edit reset on refetch, fix stale version, disable edit during loading ([7e0bb16](https://github.com/AnrPg/noema/commit/7e0bb16ac64c3ba474e00f9cd5bc22d05ecbb8f4))
* **web:** R8  typed node access in knowledge page; catch bulk-delete rejection ([a2f3e9c](https://github.com/AnrPg/noema/commit/a2f3e9c7bbd65c9b4133c6afd20583682da5531c))
* **web:** R9  remove stale any-casts in session/new and session summary pages ([2985b51](https://github.com/AnrPg/noema/commit/2985b513d21485f47f222f77831a174d2d72b6e1))
* **web:** remove session prompts from pkg builder ([0c1927e](https://github.com/AnrPg/noema/commit/0c1927e34148415f730edb288f023217086db107))
* **web:** remove stale disables, fix any-casting and mutateAsync in misconceptions page ([3e496b8](https://github.com/AnrPg/noema/commit/3e496b8264b8fa8b5101e53011cb9d650ad0b9e9))
* **web:** remove stale eslint-disable directives and fix unsafe any-casting (round 6) ([6a6065c](https://github.com/AnrPg/noema/commit/6a6065cc34b82a855feb8e876df28debcfb471fc))
* **web:** resolve Phase 07 TypeScript errors on main (typed routes + exactOptionalPropertyTypes) ([5d590db](https://github.com/AnrPg/noema/commit/5d590db941318bbdecfe3c353293f8eed604ed3c))
* **web:** round-2 audit  context menu coords, URL param, store selectors, dedup, Fix button ([3fc644a](https://github.com/AnrPg/noema/commit/3fc644a5d371357d22d7dbc15c2a3641d03ee7c8))
* **web:** round-3 audit  stable React keys, bar chart scale bug ([58af1a4](https://github.com/AnrPg/noema/commit/58af1a4fedf862382a3638449e9ab5da2b02cd1e))
* **web:** round-5 audit  session start error handling, copilot sidebar effect ([8d37140](https://github.com/AnrPg/noema/commit/8d371405a3c1259d93c42b656c196a7a79cf0213))
* **web:** Rules of Hooks violation in active session page + missing type="button" ([5fbd073](https://github.com/AnrPg/noema/commit/5fbd073eb63a9ea70934a778c51f10068447e707))
* **web:** session queue invalidation, completion off-by-one, summary error state ([9c73c83](https://github.com/AnrPg/noema/commit/9c73c83efb910565c39c86853bfc90771585a386))
* **web:** T10.B  merge transition-transform+opacity to prevent CSS override ([721f18c](https://github.com/AnrPg/noema/commit/721f18cdb577c0ccf63088ac92901f00d0d152de))
* **web:** T13  aria-label on filter inputs ([02a0a99](https://github.com/AnrPg/noema/commit/02a0a99a14673a76e16afa385a19b95975c422df))
* **web:** T16  disable buttons during active mutations ([8e9351c](https://github.com/AnrPg/noema/commit/8e9351cbef49b44268795ea323f0b26df05816d0))
* **web:** T5 quality  generic TAnswer, gate children on reveal, accessible button ([bdaaa24](https://github.com/AnrPg/noema/commit/bdaaa247eb76bc6064e774d5647ea941487d51f0))
* **web:** T5 spec gaps  CardShell props, FallbackRenderer uses CardShell, export RENDERER_MAP ([8664723](https://github.com/AnrPg/noema/commit/8664723c5c571fe9f0e18444f3098ff0cc9d23c5))
* **web:** T6  add partOfSpeech to definition preview ([65516fa](https://github.com/AnrPg/noema/commit/65516fa78e0913c4ee95d5167d24d1339813c004))
* **web:** T6 quality  CardShell actions slot, state reset on card change, aria-pressed MCQ ([cfb6e93](https://github.com/AnrPg/noema/commit/cfb6e9390825ebfa93ed5fc70a942fed327fb891))
* **web:** T7 quality  index-based matching, ordering bounds, process stable keys, cloze guard ([01b3e9c](https://github.com/AnrPg/noema/commit/01b3e9c207e3c116095fe7bd8970e28be43cc307))
* **web:** T8 quality  multimodal state image error, audio reset on card change, key stability ([98adb47](https://github.com/AnrPg/noema/commit/98adb47038b8fa3f27e25c33b0f9c36061e5fefd))
* **web:** T8.1  canvas state, Date.now() sampling, memo defaults, gradient stop ([a8d2ed5](https://github.com/AnrPg/noema/commit/a8d2ed5122b8f07eb5efa635a1b5af62b22989fb))
* **web:** T8.1  spec gaps: radius, pulse, selection, radial layout, legend ([6ee52b7](https://github.com/AnrPg/noema/commit/6ee52b7fa2f7421c4ba4d2b326fe448d6eb2a10a))
* **web:** T8.2  memoize callbacks, fix duplicate tag render, add aria-label, Escape handler ([947e73e](https://github.com/AnrPg/noema/commit/947e73efe171d69937b4575f58cf2386504ff048))
* **web:** T8.2  spec gaps: context menu, node sort, edge groups, domain tag, legend propagation ([226d634](https://github.com/AnrPg/noema/commit/226d6342551ea7ba0fc33382d835020c94d42c75))
* **web:** T8.3  fix empty state, extract buildPolygon to module scope, cleanup eslint-disables ([5854102](https://github.com/AnrPg/noema/commit/58541023a2a17ee25d2e32c0ae9d1ca157275a74))
* **web:** T9 quality  hooks before early return, stable list keys ([3bf301f](https://github.com/AnrPg/noema/commit/3bf301f7bd1672abe716315611d0242c91cfb160))
* **web:** T9.1  code quality fixes: useMemo deps, IIFE, aria-expanded ([8520703](https://github.com/AnrPg/noema/commit/85207035ea6d07efd79a18344943906e5b334424))
* **web:** T9.2  CardId cast, StateChip for state display ([bf76de0](https://github.com/AnrPg/noema/commit/bf76de0340ebc4e2c96d0fa18d3afa329a0413b3))
* **web:** T9.2  dialog role, focus management, FSRS-only condition ([6af9464](https://github.com/AnrPg/noema/commit/6af9464c4ad5f8df234c2025e536117a132354d9))
* **web:** T9.3  mutateAsync dep, try/catch, stale-results clear, fieldset/aria-pressed ([7f21dfa](https://github.com/AnrPg/noema/commit/7f21dfaad17b0f4022028628658923e257750d33))
* **web:** use @/ path aliases for internal imports in profile page ([7099840](https://github.com/AnrPg/noema/commit/70998408e574c93eb918962be2dd815703da49b9))
* **web:** use animate-pulse class for JIT-safe SVG pulse ring in knowledge graph ([65c57c7](https://github.com/AnrPg/noema/commit/65c57c7b62d61fd9f15930b51f28b5e40c9829ea))
* wire complete auth pipeline for protected API routes ([8cea042](https://github.com/AnrPg/noema/commit/8cea042095538f5ce0d10621cfb3488287ba0af7))


### { Refactoring

* **api-client:** align session contracts with service ([cc37b8c](https://github.com/AnrPg/noema/commit/cc37b8cf0ce9d48e0956c309d7634e1bc8db3b56))
* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* centralise event infrastructure in @noema/events ([59625d8](https://github.com/AnrPg/noema/commit/59625d8f417b0096ab092c8f2a91d193d9dd62ef))
* **content-service:** extract shared route helpers and add updatedBy audit tracking ([f326ab1](https://github.com/AnrPg/noema/commit/f326ab1d1958e3671788feb848f67b238ad4f614))
* **events:** simplify to base event types only ([3381fb4](https://github.com/AnrPg/noema/commit/3381fb4660b5524ce7e2d66129a976adb031f9dc))
* implement Phase 4 architecture remediation (8 fixes) ([2689c2f](https://github.com/AnrPg/noema/commit/2689c2f1c5b4dbdc0e1a235ca3f6fa3ab838c069))
* **knowledge-graph-service:** tighten identity tuple typing ([e77033e](https://github.com/AnrPg/noema/commit/e77033e17e741e34b6bc022f4c0d2c2cb8888530))
* **knowledge-graph:** improve infrastructure layer and repository implementations ([22e8a76](https://github.com/AnrPg/noema/commit/22e8a762feb97ba32faaf6786f88c3aa9df8ef85))
* modernize content-service architecture ([fddc8b8](https://github.com/AnrPg/noema/commit/fddc8b82ce43d68594e92fcb6be9fbab24dba306))
* **scheduler:** decompose event consumer into per-stream consumers ([053a484](https://github.com/AnrPg/noema/commit/053a4840f3e90f531161764d16e36dba8d2dd96b))
* **session-service:** align tool layer with content-service pattern ([d829f6d](https://github.com/AnrPg/noema/commit/d829f6d5bc395f91fe8469837d0b396ad50dbdd0))
* **types:** rename DeckId to DeckQueryLogId ([1e4888a](https://github.com/AnrPg/noema/commit/1e4888a433dbc6195701f89129eb4561011fb408))
* **types:** standardize ID prefixes and remove service-specific types ([7d954ca](https://github.com/AnrPg/noema/commit/7d954ca48e9b6d76d77e9ac203aef4e8899a3020))
* **validation:** remove mental-debugger schemas ([bd5f35a](https://github.com/AnrPg/noema/commit/bd5f35a2ab875b8623bbf23dcfd91885e1f3e804))
* **web:** extract initialState in schedule-store and document Set serialization caveat ([69f8a0a](https://github.com/AnrPg/noema/commit/69f8a0a1e8e4ee1eb7f8fd16ba7afcbc6916a3c5))


### =Ú Documentation

* add ADR-0008 for universal frontend architecture ([28ee8bb](https://github.com/AnrPg/noema/commit/28ee8bb696d3f02b7208f09faa9342f545bc68c9))
* add ADR-0009 scheduling architecture ([8897277](https://github.com/AnrPg/noema/commit/8897277f1867c3de712be95dede64fea527527f4))
* add ADR-0010 content domain and KG integration ([8c9db7a](https://github.com/AnrPg/noema/commit/8c9db7a1832c4365866fb2d4f3627923479bd69c))
* add ADR-007 for Phase 06 card system frontend architecture ([08dae7d](https://github.com/AnrPg/noema/commit/08dae7db8aec758a9cc4548b1f45f96dd664acfe))
* add ADR-012 and mark Phase 3 complete in remediation plan ([51defe9](https://github.com/AnrPg/noema/commit/51defe9d78c3934a11869d6fb47e8487014dc2c1))
* add agent MCP tool dependency registry ([ca37642](https://github.com/AnrPg/noema/commit/ca376426b2a0f7dd88003c130d3a1b7aa6f3e0c3))
* add backend/frontend phase specs and service audits ([09e4f30](https://github.com/AnrPg/noema/commit/09e4f309122dcc2c1696e2c92429efd2ebde8cad))
* add comprehensive platform features overview to copilot instructions ([18bd18b](https://github.com/AnrPg/noema/commit/18bd18ba599c796e17676ea7ec74a23bbef7c1b6))
* add GitHub Copilot instructions for AI coding agents ([499d8d5](https://github.com/AnrPg/noema/commit/499d8d5eb73e1a7257988cbda6c734159f5ef1c5))
* add Phase 07 Session Engine implementation plan ([ff8a5d9](https://github.com/AnrPg/noema/commit/ff8a5d924676bdead03d17cfee5f2b38b41b56ee))
* add rollout plans and audits ([f13b770](https://github.com/AnrPg/noema/commit/f13b770b6697d35a4f1d5d449ffe216fdd5ef563))
* **adr:** update ADR-001 with implementation details ([e1ce6eb](https://github.com/AnrPg/noema/commit/e1ce6eb0296351e3d66a41d96e7f5388f8fd677f))
* allow admin users to propose CKG mutations alongside agents ([fb59170](https://github.com/AnrPg/noema/commit/fb59170323bb1989cb659eb64d434b8da227f964))
* **api:** standardize tool failure taxonomy ([36e9ef3](https://github.com/AnrPg/noema/commit/36e9ef306e25218aebbfeaafcf83363743463934))
* define the mode-aware dual-use learning architecture ([a640f68](https://github.com/AnrPg/noema/commit/a640f68858f367d17d4a2c1055624061e6243cd7))
* expand Phase 8 API surface and add infrastructure gap analysis ([125f8a7](https://github.com/AnrPg/noema/commit/125f8a762260f3cb225b37a5626cf48654dff199))
* expand the implementation guide for mode-aware learning ([3e28f61](https://github.com/AnrPg/noema/commit/3e28f611e0759ea82f8032ed0166b23e075fb772))
* **knowledge-graph-service:** document engagement scoped graph comparison ([3b1b94f](https://github.com/AnrPg/noema/commit/3b1b94f974a116321a54e2e401c82a4c1187807b))
* **knowledge-graph-service:** document the dual-use learning rollout ([85a78cd](https://github.com/AnrPg/noema/commit/85a78cd13b0d6ae1d837da5d36ef2d8130cbd8fe))
* **knowledge-graph-service:** plan batch 7 source expansion ([7318b8f](https://github.com/AnrPg/noema/commit/7318b8f672bb745dd6823d4d2f362b4eee4f6bdf))
* **knowledge-graph-service:** record ontology import rollout ([6642d8e](https://github.com/AnrPg/noema/commit/6642d8e9d52f209865a42553d90cb5a7f9e67356))
* lock the next CKG enrichment and relation-lifting phases ([ef84539](https://github.com/AnrPg/noema/commit/ef84539598a54627ce5be4c66b385148fdcbb1b9))
* mark resolved findings in audit reports and update scheduler TODO ([8e82a66](https://github.com/AnrPg/noema/commit/8e82a6607daff8c59cab32f170238977072255e5))
* Phase 01 UI Primitives design decisions (Cortex) ([2c19d7e](https://github.com/AnrPg/noema/commit/2c19d7e0fff67eebb6f895f423c82b13570ef0b8))
* **plans:** add Phase 01 Cortex implementation plan ([c4fbff4](https://github.com/AnrPg/noema/commit/c4fbff41c75e2f6f34cbf7920703c6fed367727b))
* **release:** document ontology import operator maturity ([7de3af4](https://github.com/AnrPg/noema/commit/7de3af4c9cf95fc4e8a95101f6cccf2d09566e81))
* **scheduler-service:** close readiness parity ([6c9e0ac](https://github.com/AnrPg/noema/commit/6c9e0ac180fd600283b26743bd290b3cc2e3721d))
* **session-service:** add remediation phase pack ([7caf971](https://github.com/AnrPg/noema/commit/7caf9716f61be71f07d2fb1a347e29064fe19e46))
* update ADRs and remediation plan for Phase 1 completion ([6490b9f](https://github.com/AnrPg/noema/commit/6490b9fcc4a834fbeafedb14f2261ee118a4cefc))
* update ADRs and remediation plan for Phase 2 completion ([6cb4ade](https://github.com/AnrPg/noema/commit/6cb4adef31972028f360fa65f9ea97605ae96ba2))
* update audit docs and ADR-016 with resolution status ([2e0607b](https://github.com/AnrPg/noema/commit/2e0607bb703835eb881f6034381cde332338ab8f))
* update project context for new services ([8d6a444](https://github.com/AnrPg/noema/commit/8d6a44439f9a9e9e4f03bc319170d56a02f752a8))
* update scheduler ADRs, TODOs, and add KG implementation specs ([a57840c](https://github.com/AnrPg/noema/commit/a57840cc2393ba70d22543c1aec2066f8b8ed0c1))


###  Tests

* add content service unit tests and fix audit issues ([c2d5108](https://github.com/AnrPg/noema/commit/c2d5108a6917322d2c94c24e7957fa917a87febd))
* complete Phase 2 session invariant coverage (2.2, 2.3) ([7a3a4c1](https://github.com/AnrPg/noema/commit/7a3a4c1a65f4b321238875de69ec648330543d6e))
* **kg:** align legacy specs with current model ([aa4905f](https://github.com/AnrPg/noema/commit/aa4905f15987a1207a0902e2b44879ea47212c6c))
* **knowledge-graph-service:** add Phase 8f route integration tests (89 tests) ([a116fcf](https://github.com/AnrPg/noema/commit/a116fcfb7c2e60ea192179e56a4f13030002288f))
* **knowledge-graph-service:** implement Phase 10 testing infrastructure ([83fd398](https://github.com/AnrPg/noema/commit/83fd39831cd9b900e799f2740c5e70b01d7e4228))


### =' Build

* add third-party algorithm submodules ([12c3a6a](https://github.com/AnrPg/noema/commit/12c3a6a511d2117211e19c7f8b5e5ab7e85d1087))
* **dev:** harden shared package output for Windows Next.js ([06ea6d1](https://github.com/AnrPg/noema/commit/06ea6d130475290ae42794377f26078dc0afa9c0))
</details>

<details><summary>@noema/config: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/config-v0.1.0...@noema/config-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
</details>

<details><summary>@noema/contracts: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/contracts-v0.1.0...@noema/contracts-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* **contracts:** add universal health check contract ([70eb4f6](https://github.com/AnrPg/noema/commit/70eb4f67fb09c53d7387e33111829b162e075014))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* implement adaptive session orchestration across services ([81a3076](https://github.com/AnrPg/noema/commit/81a3076b3b125724e9bc2e5ede841779d5a9b678))
* **knowledge-graph-service:** bootstrap Phase 1 project infrastructure ([296a036](https://github.com/AnrPg/noema/commit/296a03623408b8a33bc5103d1e9cb4d50babaa8c))
* preserve current workspace changes ([94c3494](https://github.com/AnrPg/noema/commit/94c349459390000ce282f9a93e56b80d78ea916e))


### = Bug Fixes

* resolve VS Code module resolution errors ([d95e7a8](https://github.com/AnrPg/noema/commit/d95e7a80e993dbe1ca992996be3c0445b3d10ed0))


### { Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
</details>

<details><summary>@noema/events: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/events-v0.1.0...@noema/events-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* **events:** implement Phase 2 event consumers & cross-service data flow ([d7d49ef](https://github.com/AnrPg/noema/commit/d7d49ef7f0fe68a362e9f4e3436ef88551faea71))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* **knowledge-graph-service:** add KG schema enhancements and CKG revision flow (Phase 6) ([94e5bda](https://github.com/AnrPg/noema/commit/94e5bda6d87b994b3499a3221207ec25c461711a))
* **knowledge-graph-service:** add Phase 8e ontological guardrails ([8fbc534](https://github.com/AnrPg/noema/commit/8fbc534c0019fd71b5227da9256fb2f0d106eb34))
* **knowledge-graph-service:** implement Phase 5 PKG operations service layer ([caa1413](https://github.com/AnrPg/noema/commit/caa14136ebe362fb145111b6ff96a6524938a785))
* preserve current workspace changes ([94c3494](https://github.com/AnrPg/noema/commit/94c349459390000ce282f9a93e56b80d78ea916e))
* **scheduler-service:** implement phase 5 event reliability handshake ([ed68d55](https://github.com/AnrPg/noema/commit/ed68d55c65aa942464d62e00485c2bb6cf5a254f))
* **session-service:** scope sessions and streaks by study mode ([1781226](https://github.com/AnrPg/noema/commit/1781226cb8e4b4a6749b3a76f8efa3e511894b45))
* **shared:** add knowledge-graph domain types, events, and validation schemas ([1425719](https://github.com/AnrPg/noema/commit/142571990e671063428b64d40946b0db248daf9a))
* **types,events:** add session and scheduler shared type system ([47af661](https://github.com/AnrPg/noema/commit/47af6615baece7e35aff8a1064b6ada72137fbd7))
* **user-service:** add admin user management endpoints (Phase 4) ([92a73cf](https://github.com/AnrPg/noema/commit/92a73cf3db510f9d2380a9ed2cdc5ad4a7763e3e))
* **user-service:** implement Phase 1  JWT scopes, account security flows ([28263db](https://github.com/AnrPg/noema/commit/28263db5bce34d0835570c5ecf5bfc4609676a52))


### = Bug Fixes

* resolve VS Code module resolution errors ([d95e7a8](https://github.com/AnrPg/noema/commit/d95e7a80e993dbe1ca992996be3c0445b3d10ed0))


### { Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* centralise event infrastructure in @noema/events ([59625d8](https://github.com/AnrPg/noema/commit/59625d8f417b0096ab092c8f2a91d193d9dd62ef))
* **events:** simplify to base event types only ([3381fb4](https://github.com/AnrPg/noema/commit/3381fb4660b5524ce7e2d66129a976adb031f9dc))


### =Ú Documentation

* update scheduler ADRs, TODOs, and add KG implementation specs ([a57840c](https://github.com/AnrPg/noema/commit/a57840cc2393ba70d22543c1aec2066f8b8ed0c1))
</details>

<details><summary>@noema/types: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/types-v0.1.0...@noema/types-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* **ckg-service:** support reviewable ontology imports and canonical skill nodes ([8b5ea46](https://github.com/AnrPg/noema/commit/8b5ea4673f70f1892b1f42ac8bc7feef779cdcf8))
* **content-service:** harden API with type-specific validation and new endpoints ([fbaf1b9](https://github.com/AnrPg/noema/commit/fbaf1b940d74fa397cf098a3ce0b442a7e963457))
* **content-service:** implement content service vertical slice ([2f0a0f1](https://github.com/AnrPg/noema/commit/2f0a0f1d85080038ae84e35dcdf1bcfdc51dee66))
* **core:** introduce active study mode contracts ([7e453e2](https://github.com/AnrPg/noema/commit/7e453e258c8bb0623339b1b220fb8833a4c9e702))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* introduce ProposerId type to allow admin CKG mutations ([903f419](https://github.com/AnrPg/noema/commit/903f41924c356f27a919f71094483760d2e9fcde))
* **kg:** add CKG authoring and enrichment contracts ([1ced28d](https://github.com/AnrPg/noema/commit/1ced28d304d9da7ebdca6a5db2ad1b5d1f6d80df))
* **knowledge-graph-service:** add KG schema enhancements and CKG revision flow (Phase 6) ([94e5bda](https://github.com/AnrPg/noema/commit/94e5bda6d87b994b3499a3221207ec25c461711a))
* **knowledge-graph-service:** add Phase 3 domain layer ([3c24b6e](https://github.com/AnrPg/noema/commit/3c24b6e4df97125439c690fea797f5fff0fc8513))
* **knowledge-graph-service:** add Phase 8c structural analysis endpoints ([afbbfc9](https://github.com/AnrPg/noema/commit/afbbfc917bc87381984714097c44dc4edc429c8c))
* **knowledge-graph-service:** add Phase 8d ordering and ranking endpoints ([d0dcda1](https://github.com/AnrPg/noema/commit/d0dcda188daeb7eae92cd97dd5e4f161d2350164))
* **knowledge-graph-service:** add Phase 8e ontological guardrails ([8fbc534](https://github.com/AnrPg/noema/commit/8fbc534c0019fd71b5227da9256fb2f0d106eb34))
* **knowledge-graph-service:** add relational traversal endpoints (Phase 8b) ([7a58abb](https://github.com/AnrPg/noema/commit/7a58abbb6b9efc1d5d750ddef40ca4695e965bb2))
* **knowledge-graph-service:** expand canonical search and authoring ([9427f16](https://github.com/AnrPg/noema/commit/9427f1668b3e5be989bf695e76c59a63a6b884ee))
* **knowledge-graph:** implement Phase 7 structural metrics & misconception detection ([f1611bf](https://github.com/AnrPg/noema/commit/f1611bfa1f1f864ce84376c8094f2000aabae848))
* preserve current workspace changes ([94c3494](https://github.com/AnrPg/noema/commit/94c349459390000ce282f9a93e56b80d78ea916e))
* **shared:** add knowledge-graph domain types, events, and validation schemas ([1425719](https://github.com/AnrPg/noema/commit/142571990e671063428b64d40946b0db248daf9a))
* **types,events:** add session and scheduler shared type system ([47af661](https://github.com/AnrPg/noema/commit/47af6615baece7e35aff8a1064b6ada72137fbd7))


### = Bug Fixes

* **knowledge-graph-service:** align Phase 7 structural metrics with specification ([5cd3799](https://github.com/AnrPg/noema/commit/5cd37999d09a5286b596d18fb447715fc5713820))
* **knowledge-graph-service:** close Phase 1-3 implementation gaps ([c32b4f8](https://github.com/AnrPg/noema/commit/c32b4f831d0616a5e9edbc6a88dcaf5111e78936))
* Phase 0-11 audit  68 findings resolved across all layers ([2d918e0](https://github.com/AnrPg/noema/commit/2d918e00363cd79aa31943404206d9e022c2d6b3))
* resolve critical and high audit findings across all services ([39db93c](https://github.com/AnrPg/noema/commit/39db93c2057781f154521a770740706478e73696))
* resolve P0-P1 gaps across session-service hardening phases ([b1c5efd](https://github.com/AnrPg/noema/commit/b1c5efdf9a678e10c8dea468d203efa5c7e578be))
* **types:** align validateIdFormat with Zod schema, typed filters, count key isolation ([72b3d00](https://github.com/AnrPg/noema/commit/72b3d00b4e7239eedf2bedeaabb576378e7ea7c9))
* **web-admin:** minor audit findings  replaceAll, sparkline, store rename, dedup, hints cap ([1b76614](https://github.com/AnrPg/noema/commit/1b76614f30a1da23785c348599c20106ebc2b0f1))


### { Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* **types:** rename DeckId to DeckQueryLogId ([1e4888a](https://github.com/AnrPg/noema/commit/1e4888a433dbc6195701f89129eb4561011fb408))
* **types:** standardize ID prefixes and remove service-specific types ([7d954ca](https://github.com/AnrPg/noema/commit/7d954ca48e9b6d76d77e9ac203aef4e8899a3020))
</details>

<details><summary>@noema/utils: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/utils-v0.1.0...@noema/utils-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
</details>

<details><summary>@noema/validation: 0.2.0</summary>

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/validation-v0.1.0...@noema/validation-v0.2.0) (2026-04-02)


### =€ Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* **core:** introduce active study mode contracts ([7e453e2](https://github.com/AnrPg/noema/commit/7e453e258c8bb0623339b1b220fb8833a4c9e702))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* **kg:** add CKG authoring and enrichment contracts ([1ced28d](https://github.com/AnrPg/noema/commit/1ced28d304d9da7ebdca6a5db2ad1b5d1f6d80df))
* **shared:** add knowledge-graph domain types, events, and validation schemas ([1425719](https://github.com/AnrPg/noema/commit/142571990e671063428b64d40946b0db248daf9a))
* **shared:** expand auth and client support for local workflows ([4bc7073](https://github.com/AnrPg/noema/commit/4bc70732cce4298e052656d214e9c8de15e06f0c))
* **types,events:** add session and scheduler shared type system ([47af661](https://github.com/AnrPg/noema/commit/47af6615baece7e35aff8a1064b6ada72137fbd7))


### = Bug Fixes

* resolve VS Code module resolution errors ([d95e7a8](https://github.com/AnrPg/noema/commit/d95e7a80e993dbe1ca992996be3c0445b3d10ed0))


### { Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* **types:** rename DeckId to DeckQueryLogId ([1e4888a](https://github.com/AnrPg/noema/commit/1e4888a433dbc6195701f89129eb4561011fb408))
* **validation:** remove mental-debugger schemas ([bd5f35a](https://github.com/AnrPg/noema/commit/bd5f35a2ab875b8623bbf23dcfd91885e1f3e804))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).