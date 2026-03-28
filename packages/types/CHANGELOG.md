# Changelog

## [0.2.0](https://github.com/AnrPg/noema/compare/@noema/types-v0.1.0...@noema/types-v0.2.0) (2026-03-28)


### 🚀 Features

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
* **shared:** add knowledge-graph domain types, events, and validation schemas ([1425719](https://github.com/AnrPg/noema/commit/142571990e671063428b64d40946b0db248daf9a))
* **types,events:** add session and scheduler shared type system ([47af661](https://github.com/AnrPg/noema/commit/47af6615baece7e35aff8a1064b6ada72137fbd7))


### 🐛 Bug Fixes

* **knowledge-graph-service:** align Phase 7 structural metrics with specification ([5cd3799](https://github.com/AnrPg/noema/commit/5cd37999d09a5286b596d18fb447715fc5713820))
* **knowledge-graph-service:** close Phase 1-3 implementation gaps ([c32b4f8](https://github.com/AnrPg/noema/commit/c32b4f831d0616a5e9edbc6a88dcaf5111e78936))
* Phase 0-11 audit — 68 findings resolved across all layers ([2d918e0](https://github.com/AnrPg/noema/commit/2d918e00363cd79aa31943404206d9e022c2d6b3))
* resolve critical and high audit findings across all services ([39db93c](https://github.com/AnrPg/noema/commit/39db93c2057781f154521a770740706478e73696))
* resolve P0-P1 gaps across session-service hardening phases ([b1c5efd](https://github.com/AnrPg/noema/commit/b1c5efdf9a678e10c8dea468d203efa5c7e578be))
* **types:** align validateIdFormat with Zod schema, typed filters, count key isolation ([72b3d00](https://github.com/AnrPg/noema/commit/72b3d00b4e7239eedf2bedeaabb576378e7ea7c9))
* **web-admin:** minor audit findings — replaceAll, sparkline, store rename, dedup, hints cap ([1b76614](https://github.com/AnrPg/noema/commit/1b76614f30a1da23785c348599c20106ebc2b0f1))


### ♻️ Refactoring

* apply naming convention for interfaces ([f4a4932](https://github.com/AnrPg/noema/commit/f4a4932dd6a0777b689a401bb3f1c854f3ce9253))
* **types:** rename DeckId to DeckQueryLogId ([1e4888a](https://github.com/AnrPg/noema/commit/1e4888a433dbc6195701f89129eb4561011fb408))
* **types:** standardize ID prefixes and remove service-specific types ([7d954ca](https://github.com/AnrPg/noema/commit/7d954ca48e9b6d76d77e9ac203aef4e8899a3020))
