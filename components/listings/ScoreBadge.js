import { formatScore, getScoreClass } from "../../lib/listings/format"

export default function ScoreBadge({ score }) {
  return <span className={`badge ${getScoreClass(score)}`}>Score: {formatScore(score)}</span>
}
