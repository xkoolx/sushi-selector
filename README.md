# 🍣 Sushi Selector

A small, dependency-free web app that helps you decide what sushi to order.
Pick your dietary preference, the styles you like, and how adventurous you're
feeling — it filters the catalog and suggests a match.

## Running it

No build step or dependencies required. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally:

  ```sh
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

## Project structure

```
.
├── index.html      # Page markup and preference form
└── src/
    ├── data.js     # Sushi catalog with diet/style/adventure tags
    ├── app.js      # Filtering and selection logic
    └── styles.css  # Styling
```

## How selection works

1. Your preferences are read from the form (`getPreferences`).
2. The catalog in `src/data.js` is filtered (`matches`):
   - **Diet** — "Cooked only" excludes raw fish but still allows vegetarian
     items; "Vegetarian" allows only vegetarian items.
   - **Style** — only checked styles (nigiri, maki, sashimi, temaki) are kept.
   - **Adventurousness** — "Keep it classic" hides the more unusual picks;
     "Surprise me" includes everything.
3. A random item from the remaining candidates is displayed.

## Extending the catalog

Add entries to the `SUSHI` array in `src/data.js`. Each item needs:

| Field         | Values                                        |
| ------------- | --------------------------------------------- |
| `name`        | Display name                                  |
| `style`       | `nigiri`, `maki`, `sashimi`, or `temaki`      |
| `diet`        | `raw`, `cooked`, or `vegetarian`              |
| `adventure`   | `classic` or `adventurous`                    |
| `description` | One-line description shown with the result    |

## Contributing

Keep the app dependency-free where possible — plain HTML/CSS/JS keeps it easy
to run anywhere. If tooling becomes necessary (tests, bundling), propose it in
an issue first.
