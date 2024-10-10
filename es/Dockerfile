FROM elasticsearch:8.13.4

RUN elasticsearch-plugin install https://github.com/WorksApplications/elasticsearch-sudachi/releases/download/v3.2.2/elasticsearch-8.13.4-analysis-sudachi-3.2.2.zip
RUN curl -Lo sudachi-dictionary-20240716.zip https://github.com/WorksApplications/SudachiDict/releases/download/v20240716/sudachi-dictionary-20240716-full.zip && \
		unzip sudachi-dictionary-20240716.zip && \
		mkdir -p /usr/share/elasticsearch/config/sudachi/ && \
		mv sudachi-dictionary-20240716/system_full.dic /usr/share/elasticsearch/config/sudachi/ && \
		rm -rf sudachi-dictionary-20240716.zip sudachi-dictionary-20240716/

COPY sudachi.json /usr/share/elasticsearch/config/sudachi/
