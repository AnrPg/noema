# Template List Route

- `GET /v1/templates` now returns the current template summaries for the
  authenticated user scope.
- The route mirrors `POST /v1/templates/query` defaults and responds with
  `data`, `metadata.count`, and pagination details.
- This keeps the admin client's template list compatible with the
  content-service read API.
