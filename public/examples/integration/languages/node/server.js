import express from "express";

const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
const app = express();

app.get("/", (req, res)=> {
  res.send(`
    <html>
      <body>
        <h1>${process.env.TITLE}</h1>
        <p>This is the ${process.env.NODE_ENV} environment.</p>
      </body>
    </html>
  `)
});

app.listen(port, '0.0.0.0');  
console.log(`EnvKey node test app listening on ${port}...`);
console.log(`TITLE: ${process.env.TITLE}`)