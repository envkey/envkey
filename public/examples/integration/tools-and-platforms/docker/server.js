import express from "express";

const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
const app = express();

app.get("/", (req, res)=> {
  res.send(`
    <html>
      <body>
        <h1>${process.env.TITLE}</h1>
        <p>This is the ${process.env.NODE_ENV} environment.</p>
        <div>
          <label>
            <strong>Super Secret Password:</strong>
          </label>
          <span>${process.env.SUPER_SECRET_PASSWORD}</span>
        <div>
      </body>
    </html>
  `)
});

app.listen(port);

console.log(`EnvKey node test app listening on ${port}...`);

// buildpack update