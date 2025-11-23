# crate全体
- SeaORM 1.xではコード側でインデックス管理しないのでよしなにしてあげる必要がある

# userテーブル
- `chatScope`をenumにする
- `score`をDROPする(使ってない)
- ``

# noteテーブル
- `channelId`をDROPする

# roleテーブル
- `policies`を正規化する(場合によってはテーブルを分けてリレーション?)
