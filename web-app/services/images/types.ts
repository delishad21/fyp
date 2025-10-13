/** Image metadata sent from client  */
export type ImageMeta = {
  url: string; // required: where to fetch it from
  filename?: string;
  mimetype?: string;
  size?: number;
};
