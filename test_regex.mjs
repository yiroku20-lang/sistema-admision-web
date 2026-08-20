function test() {
  const finalBody = `Te recordamos que las inscripciones y el proceso de admisión se realizan exclusivamente a través de nuestra **[Página Web Oficial](https://admision.unsaac.edu.pe/)**, allí también podrás acceder al temario de evaluación, cuadro de vacantes, cronogramas de admisión y tutoriales para tu postulación.

Síguenos en nuestras redes sociales para estar siempre informado:
- **[Facebook](https://www.facebook.com/p/Direcci%C3%B3n-de-Admisi%C3%B3n-Universidad-Nacional-de-San-Antonio-Abad-del-Cusco-61562739426524/?locale=es_LA)**`;

  const htmlBody = finalBody
    .replace(/\n/g, '<br/>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
    
  console.log(htmlBody)
}
test()
