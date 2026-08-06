import { motion } from 'framer-motion';
import { ScreenFrame } from '../components/ScreenFrame';
import { NextButton } from '../components/NextButton';
import {
  TREATY_TITLE,
  TREATY_ARTICLES,
  TREATY_FOOTER_DATE,
  TREATY_FOOTER_PLACE,
} from '../data/treaty';

interface Props {
  onNext: () => void;
}

/**
 * 화면3 — 협정문.
 * 제1~9조가 좌→우 방향으로 순차 등장한 뒤, 제10조 빈칸이 강조(크롭 확대)된다.
 */
export function TreatyScreen({ onNext }: Props) {
  return (
    <ScreenFrame label="평화 협정문 화면">
      <motion.article
        className="treaty"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="treaty__title">{TREATY_TITLE}</h2>
        {TREATY_ARTICLES.map((article, idx) => (
          <motion.p
            key={idx}
            className="treaty__article"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + idx * 0.18 }}
          >
            제 {idx + 1}조 &nbsp;{article}
          </motion.p>
        ))}
        <motion.p
          className="treaty__article treaty__article--blank"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 + TREATY_ARTICLES.length * 0.18 + 0.3 }}
        >
          제 10조 &nbsp;우리는 <span className="treaty__blank-line" aria-hidden="true" />
          <span className="visually-hidden">(빈칸)</span> .
        </motion.p>
        <p className="treaty__footer">
          {TREATY_FOOTER_DATE}
          <br />
          {TREATY_FOOTER_PLACE}
        </p>
      </motion.article>

      <p className="screen__lead">
        {
          '지금까지 완성된 평화 협정문 제 1조부터 제9조에 이어,\n여러분이 선택한 단어로 마지막 제 10조를 완성해\n나만의 평화협정문을 만들어 보세요.'
        }
      </p>
      <NextButton onClick={onNext} />
    </ScreenFrame>
  );
}
