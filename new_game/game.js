const client = require("../ELK_connection");
const Worker = require("worker_threads");
var _ = require("lodash");
const https = require("https");
var request = require("sync-request");
const axios = require("axios");
//데이터베이스 접속 변수
//작동코드

const EngReview = require('../ES_data_update/review_english')
const KorReview = require('../ES_data_update/review_kor')


module.exports = class Detail {
  eng = new EngReview()
  kor = new KorReview()

  setTimeoutPromise = (ms) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), ms);
    });
  }

  work = async (new_appid, name) => {
    //반복문을 동기처리 및 실패시 재접속을 위한 함수화
    //new_appid:appid
    await setTimeoutPromise(6000);
    await axios
      .get(
        `https://store.steampowered.com/api/appdetails?appids=${new_appid}&l=korean`,
        {
          contentType: "utf-8",
        },
        {
          baseURL: `https://store.steampowered.com/`,
          timeout: 60000, //아웃바운드 문제 - 포트복제등이 timeout으로 쌓이다보니까 나중에 요청을 보내지를 못함.
          httpsAgent: new https.Agent({ keepAlive: true }),
          headers: { "Content-Type": "application/xml" },
        }
      )
      .then(async (response) => {
        if (response.data !== "" || null || undefined) {
          const res = response.data;
          if (
            res[new_appid].success &&
            res[new_appid].data.img_url !== null &&
            res[new_appid].data.short_description !== null
          ) {
            const result = res[new_appid].data;

            // bulk 개행을 본다길래 일단 일자로..
            const body = { params: { retry_on_conflict: 6 }, name: result.name, name_eng: name, img_url: result.header_image ? result.header_image : null, appid: new_appid, short_description: result.short_description ? result.short_description : null, supported_language: result.supported_language ? result.supported_language : null, categories: result.categories ? result.categories : null, type: result.type ? result.type : null, genres: result.genres ? result.genres : null, release_date: result.release_date ? result.release_date : null, platforms: result.platforms ? result.platforms : null, price_overview: result.price_overview ? result.price_overview : null, metacritic: result.metacritic ? result.metacritic : null, recommendations: result.recommendations ? result.recommendations : null, pass: 'december', }
            return body
          }
        }
      })
      .catch(async (error) => {
        console.log("멈춤 => " + error);
        await setTimeoutPromise(100000);
        await work(new_appid);
      });
  }



}

