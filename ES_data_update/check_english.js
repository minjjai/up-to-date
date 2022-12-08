const Worker = require("worker_threads");
var _ = require("lodash");
var request = require("sync-request");
const client = require("../ELK_connection");
const https = require("https");
const axios = require("axios");
// const { Reviews, Games } = require("./models");
const { nextTick } = require("process");
//데이터베이스 접속 변수
//작동코드
function setTimeoutPromise(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), ms);
  });
}
async function work(n, index) {
  //반복문을 동기처리 및 실패시 재접속을 위한 함수화
  console.log("index : " + index, "appid:" + n);

  //n:appid
  await setTimeoutPromise(1000);
  await axios
    .get(
      `http://store.steampowered.com/appreviews/${n}?json=1&l=english&filter=recent&num_per_page=100`,
      {
        contentType: "utf-8",
        // method: "GET",
        // uri: uri,
      },
      {
        baseURL: `http://store.steampowered.com/appreviews/${n}?json=1&l=english&filter=recent&num_per_page=100`,
        timeout: 60000, //optional
        httpsAgent: new https.Agent({ keepAlive: true }),
        headers: { "Content-Type": "application/xml" },
      }
    )
    .then(async (response, next) => {
      if (response !== undefined) {
        if (!response?.body?.slice(0, 6).includes("<")) {
          //access deined발생시 axios에러를 뱉어서 여기까지 안옴
          //response.body는 undefind로 나옴
          const res = response;
          console.log(res.reviews);
          if (res.success) {
            //response.data는 jsonparse필요없음
            if (res.query_summary?.num_reviews === 0) {
              return;
            } else {
              for (let j of res.reviews) {
                const reuslt_check = await check(j.recommendationid);
                if (!reuslt_check) {
                  // false === 중복이 없는 경우 생성
                  await client.index({
                    index: "review_data",
                    refresh: wait_for,
                    id: j.recommendationid,
                    body: {
                      params: { retry_on_conflict: 6 },
                      doc: {
                        appid: n,
                        recommendationid: j.recommendationid,
                        steamid: j.author.steamid,
                        playtime_at_review: j.author.playtime_at_review,
                        language: j.language,
                        review: j.review,
                        timestamp_updated: j.timestamp_created,
                        voted_up: j.voted_up,
                        votes_up: j.votes_up,
                        votes_funny: j.votes_funny,
                        weighted_vote_score: j.weighted_vote_score,
                      },
                    },
                  });
                  console.log("생성");
                } else {
                  // object === 중복 있는 경우 수정
                  await client.update({
                    index: "review_data",
                    refresh: wait_for,
                    id: reuslt_check._id, // 와 지렸다 진짜 지렸어여
                    body: {
                      params: { retry_on_conflict: 6 },
                      doc: {
                        appid: n,
                        recommendationid: j.recommendationid,
                        steamid: j.author.steamid,
                        playtime_at_review: j.author.playtime_at_review,
                        language: j.language,
                        review: j.review,
                        timestamp_updated: j.timestamp_created,
                        voted_up: j.voted_up,
                        votes_up: j.votes_up,
                        votes_funny: j.votes_funny,
                        weighted_vote_score: j.weighted_vote_score,
                      },
                    },
                  });
                  console.log("업데이트");
                }
                // 업데이트 유무 상관없이 크롤링한 평가 정보 games_data 에 업데이트
                await client.update({
                  index: "games_data",
                  refresh: wait_for,
                  id: n,
                  body: {
                    params: { retry_on_conflict: 6 },
                    doc: {
                      num_reviews: query_summary.j.num_reviews,
                      review_score: query_summary.j.review_score,
                      review_score_desc: query_summary.j.review_score_desc,
                      total_positive: query_summary.j.total_positive,
                      total_negative: query_summary.j.total_negative,
                      total_reviews: query_summary.j.total_reviews,
                    },
                  },
                });
              }
            }
          }
        }
      }
    })
    .catch(async (error) => {
      console.log("멈춤 => " + error);
      await setTimeoutPromise(6000);
      await work(n, index);
    });
}

test = async () => {
  let num = Worker.threadId;
  let list = await finAllList(num);
  //game테이블에서 리스트 구합니다.
  //배열을 2개씩 나눕니다.
  let index = 0;
  for (const i of list) {
    //두개씩있는 배열 반복
    index++;
    await work(i, index);
    await setTimeoutPromise(1000);
  }
};
let finAllList = async (num) => {
  // 갯수세는 것 뿐
  const count = await client.count({ index: "games_data" });

  const work_start = Math.floor((count.count * (num - 1)) / 4);
  const work_end = Math.floor((count.count * num) / 4) - 1;
  console.log(`일꾼 ${num}번 시작 ${work_start} ~ 끝 ${work_end}}`);
  // 시작 0 / 끝 50181}
  // 시작 50182 / 끝 100364}
  // 시작 100365 / 끝 150547}
  let term = Math.floor((work_end - work_start) / 6) - 1; //from과 size의 합이 10000이 넘으면 안된다고 해서
  console.log(term);
  let list = [];
  for (let i = 0; i < 6; i++) {
    //게임 리스트
    let appids = await client.search({
      index: "games_data",
      from: i,
      size: term,
      _source: ["appid"],
    });
    const hits = appids.hits.hits;
    for (let j = 0; j < hits.length; j++) {
      list.push(hits[j]._source.appid);
      // list.push(appids.hits.hits);
      // console.log(list);
    }
  }
  console.log(list);
  return list;
}; // ?

// 리뷰 중복체크
let check = async (recommendationid) => {
  const list = await client.search({
    index: "review_data",
    body: {
      query: {
        bool: {
          must: [{ match: { recommendationid: recommendationid } }],
        },
      },
    },
  });
  if (!list.hits.hits.length) {
    return false;
  } else {
    return list.hits.hits[0];
  }
};

// let checkReview = async (appid) => {
//   let list = await Reviews.findOne({
//     where: {
//       appid,
//       language: "english",
//     },
//     raw: true,
//   });
//   return list !== null;
// };

// let existReview = async (appid, steamid, timestamp_updated) => {
//   let list = await Reviews.findOne({
//     where: {
//       appid,
//       steamid,
//       timestamp_updated,
//       language: "english",
//     },
//     raw: true,
//   });
//   return list !== null;
// };
test();
