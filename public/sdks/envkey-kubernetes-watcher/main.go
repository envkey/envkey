package main

import (
	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/cluster"
	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/kube"

	"github.com/apex/log"
)

func main() {
	err := kube.Init()
	if err != nil {
		log.WithError(err).Error("Error initializing Kubernetes client")
		panic(err.Error())
	}

	namespaces, err := cluster.GetNamespaces()
	if err != nil {
		log.WithError(err).Error("Error listing namespaces")
		panic(err.Error())
	}

	err = cluster.Sync(namespaces)
	if err != nil {
		log.Error("Error on initial sync of cluster state")
		panic(err.Error())
	}

	err = cluster.WatchCluster(namespaces)
	if err != nil {
		log.Error("Error starting watch of cluster API endpoints")
		panic(err.Error())
	}

}
