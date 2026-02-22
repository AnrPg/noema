# Changelog

## [0.1.1](https://github.com/AnrPg/noema/compare/noema-v0.1.0...noema-v0.1.1) (2026-02-22)


### 🚀 Features

* add config, settings & infrastructure files ([ad67bdf](https://github.com/AnrPg/noema/commit/ad67bdf26418f696e157e8252c360a96fdbb5200))
* add step progress counter to registration wizard ([4c33eda](https://github.com/AnrPg/noema/commit/4c33eda23168e18301a2d8680a62919b8fedd4af))
* add user detail page with navigation from users list ([9fafd42](https://github.com/AnrPg/noema/commit/9fafd42c1c7d8b032d3c46d19d8fb286d52d7ae4))
* **api-client:** add HTTP client package for backend communication ([9a8ba38](https://github.com/AnrPg/noema/commit/9a8ba38e54da6069ead2c5bbf0b7773bae0f210b))
* **auth:** add authentication context and guard components ([f1b8845](https://github.com/AnrPg/noema/commit/f1b8845b0001ee7c411f8288d3d9f8612d23cb8e))
* **content-service:** harden API with type-specific validation and new endpoints ([fbaf1b9](https://github.com/AnrPg/noema/commit/fbaf1b940d74fa397cf098a3ce0b442a7e963457))
* **content-service:** implement content service vertical slice ([2f0a0f1](https://github.com/AnrPg/noema/commit/2f0a0f1d85080038ae84e35dcdf1bcfdc51dee66))
* **contracts:** add universal health check contract ([70eb4f6](https://github.com/AnrPg/noema/commit/70eb4f67fb09c53d7387e33111829b162e075014))
* enhanced registration page with multi-step wizard, timezone map, and trie-based country selector ([c0ef824](https://github.com/AnrPg/noema/commit/c0ef8249ae62e85c5037a484930566ff00c32f26))
* first commit ([8ae0c78](https://github.com/AnrPg/noema/commit/8ae0c786cda3a0aded83352c73e5b5092e05e049))
* **foundation:** implement Phase 0 foundation layer type system ([9dfed9f](https://github.com/AnrPg/noema/commit/9dfed9fa3f35813955496a18bfada327b6d0db30))
* **hlr-sidecar:** add HLR Python sidecar ([7279e85](https://github.com/AnrPg/noema/commit/7279e85e74030762020739849575676bd2ab14d6))
* make country field required in registration ([52d0ae8](https://github.com/AnrPg/noema/commit/52d0ae8b744001203c9c02b088788616b65df72b))
* **metacognition-service:** add mental-debugger types ([9e92239](https://github.com/AnrPg/noema/commit/9e9223986d6b7e6320b4cf6438d58d154734d981))
* **ui:** add shared UI component library ([7d49fcc](https://github.com/AnrPg/noema/commit/7d49fcc1a850e3519b44f2ced60e1bbcbefa89d4))
* **user-service:** add CORS support ([49d03c5](https://github.com/AnrPg/noema/commit/49d03c5a1c6b7d3a4f0edd26da71773d666adea4))
* **user-service:** add initial database migrations ([1bf06e2](https://github.com/AnrPg/noema/commit/1bf06e27ac3b8a41b6f24d5f8578577b4dc3f64f))
* **user-service:** implement user service with full CRUD operations ([6566268](https://github.com/AnrPg/noema/commit/656626888d0aca08cd3fbe5868c8bc719a2e9669))
* **web-admin:** add admin dashboard application ([379ca9e](https://github.com/AnrPg/noema/commit/379ca9e5a4114609eb83fc2ac77ef0d4f83a3ea2))
* **web:** add main web application for learners ([c6b78b7](https://github.com/AnrPg/noema/commit/c6b78b7b7c9a89cb4eb3924e2c95c3564b37bf1b))


### 🐛 Bug Fixes

* correct template migration column and add barrel export ([f192c0c](https://github.com/AnrPg/noema/commit/f192c0c8a75cadf8739623159435e2573acb78f7))
* isolate Prisma client generation per service ([a8f1db4](https://github.com/AnrPg/noema/commit/a8f1db4027f40dc4a1783d9f719d16e02bba3cd0))
* resolve all lint errors in enhanced registration feature ([5b6ede1](https://github.com/AnrPg/noema/commit/5b6ede1ebb089754f4a19f4d5eb7f77b38971f36))
* resolve registration, user list display, and dashboard data issues ([9c77d42](https://github.com/AnrPg/noema/commit/9c77d426a8a10cfd941eff47fdb62baef3166fc9))
* resolve VS Code module resolution errors ([d95e7a8](https://github.com/AnrPg/noema/commit/d95e7a80e993dbe1ca992996be3c0445b3d10ed0))
* **user-service:** fix pino-pretty ESM transport resolution issue ([dc0a2de](https://github.com/AnrPg/noema/commit/dc0a2dee786e2c2507a70c6a8cc9f5b444e1af67))
* **user-service:** resolve TypeScript strict mode errors ([ba63df8](https://github.com/AnrPg/noema/commit/ba63df8e6b4c678e36d27b5cc9ce7ce668fcda61))
* **user-service:** use proper error types ([681d331](https://github.com/AnrPg/noema/commit/681d331666b0b5c8d32a6ddfa1c52b4493d7316a))
* wire complete auth pipeline for protected API routes ([8cea042](https://github.com/AnrPg/noema/commit/8cea042095538f5ce0d10621cfb3488287ba0af7))


### ♻️ Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* **events:** simplify to base event types only ([3381fb4](https://github.com/AnrPg/noema/commit/3381fb4660b5524ce7e2d66129a976adb031f9dc))
* modernize content-service architecture ([fddc8b8](https://github.com/AnrPg/noema/commit/fddc8b82ce43d68594e92fcb6be9fbab24dba306))
* **types:** rename DeckId to DeckQueryLogId ([1e4888a](https://github.com/AnrPg/noema/commit/1e4888a433dbc6195701f89129eb4561011fb408))
* **types:** standardize ID prefixes and remove service-specific types ([7d954ca](https://github.com/AnrPg/noema/commit/7d954ca48e9b6d76d77e9ac203aef4e8899a3020))
* **validation:** remove mental-debugger schemas ([bd5f35a](https://github.com/AnrPg/noema/commit/bd5f35a2ab875b8623bbf23dcfd91885e1f3e804))


### 📚 Documentation

* add ADR-0008 for universal frontend architecture ([28ee8bb](https://github.com/AnrPg/noema/commit/28ee8bb696d3f02b7208f09faa9342f545bc68c9))
* add ADR-0009 scheduling architecture ([8897277](https://github.com/AnrPg/noema/commit/8897277f1867c3de712be95dede64fea527527f4))
* add ADR-0010 content domain and KG integration ([8c9db7a](https://github.com/AnrPg/noema/commit/8c9db7a1832c4365866fb2d4f3627923479bd69c))
* add agent MCP tool dependency registry ([ca37642](https://github.com/AnrPg/noema/commit/ca376426b2a0f7dd88003c130d3a1b7aa6f3e0c3))
* add comprehensive platform features overview to copilot instructions ([18bd18b](https://github.com/AnrPg/noema/commit/18bd18ba599c796e17676ea7ec74a23bbef7c1b6))
* add GitHub Copilot instructions for AI coding agents ([499d8d5](https://github.com/AnrPg/noema/commit/499d8d5eb73e1a7257988cbda6c734159f5ef1c5))
* **adr:** update ADR-001 with implementation details ([e1ce6eb](https://github.com/AnrPg/noema/commit/e1ce6eb0296351e3d66a41d96e7f5388f8fd677f))
* update project context for new services ([8d6a444](https://github.com/AnrPg/noema/commit/8d6a44439f9a9e9e4f03bc319170d56a02f752a8))


### ✅ Tests

* add content service unit tests and fix audit issues ([c2d5108](https://github.com/AnrPg/noema/commit/c2d5108a6917322d2c94c24e7957fa917a87febd))


### 🔧 Build

* add third-party algorithm submodules ([12c3a6a](https://github.com/AnrPg/noema/commit/12c3a6a511d2117211e19c7f8b5e5ab7e85d1087))
