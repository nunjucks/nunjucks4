import styles from "./EditorsNote.module.scss";
import { EditorsNoteFragment } from "types/api";
import { formatArticleUpdatedDate } from "utils/date";
import { gql } from "utils/urql";
const EditorsNote = ({ content, datePublished }: EditorsNoteFragment) => {
    return (<>
      {content && (<section className={styles.root} id="editors-note">
          <div className={styles.content}>
            <span className={styles.label}>Editor&rsquo;s Note: </span>
            <span dangerouslySetInnerHTML={{ __html: content }}/>
          </div>
        </section>)}
      {datePublished && (<section className={styles.root}>
          <div className={styles.content}>
            <span>Updated at {formatArticleUpdatedDate(datePublished)}</span>
          </div>
        </section>)}
    </>);
};
EditorsNote.fragment = gql `
  fragment editorsNote on EditorsNote {
    content
    datePublished
  }
`;
export default EditorsNote;
