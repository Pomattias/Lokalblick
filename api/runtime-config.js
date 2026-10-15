export default function handler(req, res) {
  const cartoKey =
    process.env.VITE_CARTO_API_KEY ||
    process.env.CARTO_API_KEY ||
    "";
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(
    "window.LokalblickRuntime=Object.assign({},window.LokalblickRuntime||{},{" +
      "cartoApiKey:" + JSON.stringify(cartoKey) +
    "});"
  );
}
