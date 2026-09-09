import { Helmet } from "react-helmet-async";

const BASE_URL = "https://kinair.ae";

interface SeoProps {
  title: string;
  description: string;
  /** Route path, e.g. "/about". Used for the self-referencing canonical and og:url. */
  path: string;
  /** Hide private/utility pages from search engines. */
  noindex?: boolean;
}

export function Seo({ title, description, path, noindex }: SeoProps) {
  const url = path === "/" ? `${BASE_URL}/` : `${BASE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}
